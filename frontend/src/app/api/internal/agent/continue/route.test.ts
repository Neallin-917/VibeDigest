import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTurn } from '@/lib/agent/backend'
import { POST } from './route'

const { claim, createClient, runAgent, config } = vi.hoisted(() => ({
  claim: vi.fn(), createClient: vi.fn(), runAgent: vi.fn(),
  config: { AGENT_INTERNAL_SECRET: 'test-only-agent-shared-secret-at-least-32-characters' as string | undefined, BACKEND_API_URL: 'https://backend.example.test' },
}))
vi.mock('@/env', () => ({ env: config }))
vi.mock('@/lib/agent/backend', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/agent/backend')>(), agentBackend: claim, createTurnClient: createClient,
}))
vi.mock('@/lib/agent/task-agent', () => ({ runTaskAgent: runAgent }))

const path = '/api/internal/agent/continue'
const secret = 'test-only-agent-shared-secret-at-least-32-characters'
const now = 1_800_000_000
const delivery = { turnId: '33333333-3333-4333-8333-333333333333', jobId: '55555555-5555-4555-8555-555555555555', queueName: 'agent_answers', messageId: 3, readCount: 1 }
const turn: AgentTurn = {
  id: delivery.turnId, thread_id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222',
  input_message_id: 'user-1', task_id: '44444444-4444-4444-8444-444444444444', status: 'finalizing', execution_token: 'PRIVATE_FENCING_TOKEN',
  runtime_config: { runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart', reasoningEffort: 'provider-default', locale: 'zh' },
}
const client = { fixture: 'private scoped client' }
function request(payload: unknown = delivery, options: { sentAt?: number; signPath?: string; signature?: string; raw?: string } = {}) {
  const body = options.raw ?? JSON.stringify(payload)
  const sentAt = String(options.sentAt ?? now)
  const signature = options.signature ?? createHmac('sha256', secret).update(`${sentAt}\nPOST\n${options.signPath ?? path}\n${body}`).digest('hex')
  return new Request('https://frontend.example.test' + path, { method: 'POST', body, headers: { 'x-agent-sent-at': sentAt, 'x-agent-signature': signature } })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
  config.AGENT_INTERNAL_SECRET = secret
  claim.mockResolvedValue(turn)
  createClient.mockReturnValue(client)
  runAgent.mockResolvedValue({ saved: true })
})
afterEach(() => { vi.restoreAllMocks() })

describe('signed background continuation ingress', () => {
  it('claims the exact queue delivery before execution and acknowledges only after durable save', async () => {
    const req = request()
    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ completed: true })
    expect(claim).toHaveBeenCalledWith('/turns/' + delivery.turnId + '/claim', {
      jobId: delivery.jobId, queueName: delivery.queueName, messageId: delivery.messageId, readCount: delivery.readCount,
    }, req.signal)
    expect(createClient).toHaveBeenCalledWith(turn, req.signal)
    expect(runAgent).toHaveBeenCalledWith(turn, client, { signal: req.signal })
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(runAgent.mock.invocationCallOrder[0])
  })

  it('waits for durable persistence instead of acknowledging an in-flight answer', async () => {
    let release!: (value: { saved: boolean }) => void
    runAgent.mockReturnValue(new Promise(resolve => { release = resolve }))
    let settled = false
    const pending = POST(request()).then(result => { settled = true; return result })
    await vi.waitFor(() => expect(runAgent).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    release({ saved: true })
    expect((await pending).status).toBe(200)
  })

  it('acknowledges an already-terminal delivery without executing a duplicate answer', async () => {
    claim.mockResolvedValue({ skip: true })
    expect(await (await POST(request())).json()).toEqual({ completed: true })
    expect(runAgent).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('defers an actively leased answer without treating it as a failed attempt', async () => {
    claim.mockResolvedValue({ deferSeconds: 90 })
    const response = await POST(request())
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ deferSeconds: 90 })
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('does not acknowledge a fenced or unsaved result', async () => {
    runAgent.mockResolvedValue({ saved: false })
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ completed: false })
  })

  it.each(['claim', 'run'])('sanitizes a %s failure and leaves the delivery retryable', async where => {
    const error = new Error('PRIVATE_DATABASE_URL_AND_TOKEN')
    if (where === 'claim') claim.mockRejectedValue(error)
    else runAgent.mockRejectedValue(error)
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ completed: false })
  })

  it.each([
    { signature: '' }, { signature: 'a'.repeat(64) }, { sentAt: now - 61 }, { sentAt: now + 61 }, { signPath: '/different-endpoint' },
  ])('rejects untrusted signatures before claiming or invoking the model', async options => {
    expect((await POST(request(delivery, options))).status).toBe(401)
    expect(claim).not.toHaveBeenCalled()
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('fails closed when no shared secret is configured', async () => {
    config.AGENT_INTERNAL_SECRET = undefined
    expect((await POST(request())).status).toBe(401)
    expect(claim).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies before any business action', async () => {
    expect((await POST(request(null, { raw: 'x'.repeat(4001) }))).status).toBe(401)
    expect(claim).not.toHaveBeenCalled()
  })

  it('rejects malformed but correctly signed JSON', async () => {
    expect((await POST(request(null, { raw: '{' }))).status).toBe(400)
    expect(claim).not.toHaveBeenCalled()
  })

  it.each([
    { ...delivery, turnId: 'not-a-uuid' }, { ...delivery, jobId: 'bad' }, { ...delivery, queueName: 'video_processing' },
    { ...delivery, messageId: 0 }, { ...delivery, readCount: -1 }, { ...delivery, token: 'model-supplied-token' },
  ])('rejects an invalid signed delivery contract', async payload => {
    expect((await POST(request(payload))).status).toBe(400)
    expect(claim).not.toHaveBeenCalled()
  })

  it('accepts an explicit developer-scoped queue name without changing it', async () => {
    const queueName = 'agent_answers_local_developer_a'
    expect((await POST(request({ ...delivery, queueName }))).status).toBe(200)
    expect(claim.mock.calls[0][1].queueName).toBe(queueName)
  })
})
