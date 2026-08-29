import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTurn, TurnClient } from '@/lib/agent/backend'
import type { ChatUIMessagePart } from '@/lib/chat-ui'
import { AgentServiceError } from '@/lib/agent/backend'
import { POST } from './route'

const { acceptTurn, createClient, runAgent, resolveRuntime, auth, history } = vi.hoisted(() => ({
  acceptTurn: vi.fn(), createClient: vi.fn(), runAgent: vi.fn(), resolveRuntime: vi.fn(), auth: vi.fn(), history: vi.fn(),
}))
vi.mock('@/env', () => ({ env: { AGENT_INTERNAL_SECRET: 'test-only-secret-more-than-32-characters', BACKEND_API_URL: 'https://backend.example.test' } }))
vi.mock('@/lib/agent/backend', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/agent/backend')>(), agentBackend: acceptTurn, createTurnClient: createClient,
}))
vi.mock('@/lib/agent/task-agent', () => ({ runTaskAgent: runAgent, resolveAgentRuntime: resolveRuntime }))
vi.mock('./auth', () => ({ verifyAuth: auth, isAuthError: (value: object) => 'response' in value }))

const threadId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const taskId = '44444444-4444-4444-8444-444444444444'
const turn: AgentTurn = {
  id: '33333333-3333-4333-8333-333333333333', thread_id: threadId, user_id: userId,
  input_message_id: 'user-1', task_id: taskId, status: 'running', execution_token: 'PRIVATE_EXECUTION_TOKEN',
  runtime_config: { runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart', reasoningEffort: 'provider-default', locale: 'zh' },
}
const message = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Explain this video https://youtu.be/fixture' }] }
const client = { history } as unknown as TurnClient
const source: ChatUIMessagePart = { type: 'source-url', sourceId: 'ref-1', url: 'https://youtu.be/fixture?t=45', title: 'Source · 0:45' }
const task: ChatUIMessagePart = { type: 'data-task-status', id: 'task-status-' + taskId, data: { taskId, status: 'pending' } }
const request = (body: unknown = { threadId, message }) => new Request('https://frontend.example.test/api/chat', { method: 'POST', body: JSON.stringify(body) })
async function events(response: Response): Promise<Record<string, unknown>[]> {
  return (await response.text()).split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => JSON.parse(line.slice(6)))
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.mockResolvedValue({ user: { id: userId }, accessToken: 'PRIVATE_AUTH_TOKEN' })
  resolveRuntime.mockReturnValue(turn.runtime_config)
  acceptTurn.mockResolvedValue(turn)
  createClient.mockReturnValue(client)
  history.mockResolvedValue({ messages: [] })
  runAgent.mockImplementation(async (_turn, _client, callbacks) => {
    callbacks.onText?.('Grounded answer.')
    callbacks.onPart?.(source)
    return { saved: true, waiting: false, parts: [{ type: 'text', text: 'Grounded answer.' }, source], metadata: { ...turn.runtime_config, inputTokens: 12 } }
  })
})

describe('POST /api/chat unified Agent entry', () => {
  it('accepts immutable user input before inference, using authenticated identity rather than request identity', async () => {
    const response = await POST(request({ threadId, taskId, locale: 'en', scope: 'source', message, userId: 'attacker' }))
    await events(response)
    expect(auth).toHaveBeenCalledOnce()
    expect(resolveRuntime).toHaveBeenCalledWith('en')
    expect(acceptTurn).toHaveBeenCalledWith('/turns', {
      userId, threadId, messageId: 'user-1', parts: message.parts, taskId,
      title: 'Explain this video', runtimeConfig: { ...turn.runtime_config, scope: 'source' },
    }, expect.any(AbortSignal))
    expect(auth.mock.invocationCallOrder[0]).toBeLessThan(acceptTurn.mock.invocationCallOrder[0])
    expect(acceptTurn.mock.invocationCallOrder[0]).toBeLessThan(runAgent.mock.invocationCallOrder[0])
    expect(createClient).toHaveBeenCalledWith(turn, expect.any(AbortSignal))
  })

  it('does not start execution until the accepted turn has been durably returned', async () => {
    let release!: (value: AgentTurn) => void
    acceptTurn.mockReturnValue(new Promise<AgentTurn>(resolve => { release = resolve }))
    const pending = POST(request())
    await vi.waitFor(() => expect(acceptTurn).toHaveBeenCalledOnce())
    expect(runAgent).not.toHaveBeenCalled()
    release(turn)
    await events(await pending)
    expect(runAgent).toHaveBeenCalledOnce()
  })

  it('sends standalone URLs through the Agent, with default workspace scope and locale', async () => {
    await events(await POST(request({ threadId, message: { ...message, parts: [{ type: 'text', text: 'https://youtu.be/fixture' }] } })))
    expect(acceptTurn).toHaveBeenCalledWith('/turns', expect.objectContaining({ title: 'YouTube · fixture', taskId: null, runtimeConfig: expect.objectContaining({ scope: 'workspace' }) }), expect.any(AbortSignal))
    expect(resolveRuntime).toHaveBeenCalledWith('zh')
    expect(runAgent).toHaveBeenCalledOnce()
  })

  it('streams a stable assistant ID, text and citations without exposing service credentials', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const chunks = await events(response)
    expect(chunks).toContainEqual({ type: 'start', messageId: 'agent:' + turn.id + ':reply', messageMetadata: expect.objectContaining({ agentTurnId: turn.id, agentState: 'running' }) })
    expect(chunks).toContainEqual({ type: 'text-delta', id: 'answer', delta: 'Grounded answer.' })
    expect(chunks).toContainEqual(source)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', messageMetadata: { agentState: 'completed', inputTokens: 12 } })
    expect(JSON.stringify(chunks)).not.toContain('PRIVATE_EXECUTION_TOKEN')
    expect(JSON.stringify(chunks)).not.toContain('PRIVATE_AUTH_TOKEN')
  })

  it('projects only allowed public parts even if an executor callback includes a native tool result', async () => {
    runAgent.mockImplementation(async (_turn, _client, callbacks) => {
      callbacks.onPart({ type: 'dynamic-tool', toolName: 'search_source', output: 'PRIVATE_TRANSCRIPT' })
      callbacks.onPart(task)
      return { saved: true, waiting: true, parts: [task], metadata: {} }
    })
    const chunks = await events(await POST(request()))
    expect(chunks).toContainEqual(task)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', messageMetadata: { agentState: 'waiting_task' } })
    expect(chunks.some(chunk => chunk.type === 'text-start')).toBe(false)
    expect(JSON.stringify(chunks)).not.toContain('PRIVATE_TRANSCRIPT')
  })

  it('forwards browser cancellation to acceptance and execution', async () => {
    const controller = new AbortController()
    const req = new Request(request(), { signal: controller.signal })
    await events(await POST(req))
    expect(acceptTurn.mock.calls[0][2]).toBe(req.signal)
    expect(runAgent.mock.calls[0][2].signal).toBe(req.signal)
  })
})

describe('chat request validation and safe failures', () => {
  it.each([
    {}, { threadId: 'bad', message }, { threadId, message: { ...message, role: 'assistant' } },
    { threadId, message: { ...message, parts: [] } },
    { threadId, message: { ...message, parts: [{ type: 'text', text: ' ' }] } },
    { threadId, message: { ...message, parts: [{ type: 'text', text: 'x'.repeat(30_001) }] } },
    { threadId, message: { ...message, parts: [{ type: 'tool-result', output: 'untrusted' }] } },
    { threadId, message: { ...message, parts: [message.parts[0], message.parts[0]] } },
    { threadId, message, locale: 'fr' }, { threadId, message, scope: 'admin' },
  ])('rejects an invalid user-message shape before accepting or invoking the model', async body => {
    const response = await POST(request(body))
    expect(response.status).toBe(400)
    expect(acceptTurn).not.toHaveBeenCalled()
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('https://frontend.example.test/api/chat', { method: 'POST', body: '{' }))
    expect(response.status).toBe(400)
    expect(acceptTurn).not.toHaveBeenCalled()
  })

  it('returns the authentication rejection without creating a turn', async () => {
    const rejection = Response.json({ error: 'Unauthorized' }, { status: 401 })
    auth.mockResolvedValue({ response: rejection })
    expect(await POST(request())).toBe(rejection)
    expect(acceptTurn).not.toHaveBeenCalled()
    expect(runAgent).not.toHaveBeenCalled()
  })

  it.each([402, 403, 409, 503])('retains a safe service error status %s before streaming', async status => {
    acceptTurn.mockRejectedValue(new AgentServiceError(status))
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: new AgentServiceError(status).message })
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('hides unexpected pre-stream failures', async () => {
    auth.mockRejectedValue(new Error('PRIVATE_DB_CREDENTIAL'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('PRIVATE_DB_CREDENTIAL')
  })

  it('closes partial text and emits a safe stream error without a false finish', async () => {
    runAgent.mockImplementation(async (_turn, _client, callbacks) => {
      callbacks.onText('Partial answer')
      throw new Error('PRIVATE_PROVIDER_KEY')
    })
    const chunks = await events(await POST(request()))
    expect(chunks).toContainEqual({ type: 'text-end', id: 'answer' })
    expect(chunks).toContainEqual({ type: 'error', errorText: expect.stringContaining('accepted video task will continue') })
    expect(chunks.some(chunk => chunk.type === 'finish')).toBe(false)
    expect(JSON.stringify(chunks)).not.toContain('PRIVATE_PROVIDER_KEY')
  })
})

describe('idempotent chat replay', () => {
  beforeEach(() => { acceptTurn.mockResolvedValue({ ...turn, replayed: true }) })

  function stored(suffix: 'reply' | 'completion', text: string, parts: unknown[] = []) {
    return { id: 'agent:' + turn.id + ':' + suffix, role: 'assistant', created_at: '2026-08-28T00:00:00Z', content: [{ type: 'text', text }, ...parts], metadata: { agentState: 'completed' } }
  }

  it('prefers the final completion and never invokes a model or repeats tools', async () => {
    history.mockResolvedValue({ messages: [stored('reply', 'Accepted'), stored('completion', 'Completed answer', [source])] })
    const chunks = await events(await POST(request()))
    expect(chunks[0]).toMatchObject({ type: 'start', messageId: 'agent:' + turn.id + ':completion' })
    expect(chunks).toContainEqual({ type: 'text-delta', id: 'answer', delta: 'Completed answer' })
    expect(chunks).toContainEqual(source)
    expect(JSON.stringify(chunks)).not.toContain('Accepted')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('replays a durable task receipt and strips historical private tool parts', async () => {
    history.mockResolvedValue({ messages: [stored('reply', 'Work accepted', [task, { type: 'dynamic-tool', output: 'PRIVATE_OLD_TRANSCRIPT' }])] })
    const chunks = await events(await POST(request()))
    expect(chunks).toContainEqual(task)
    expect(JSON.stringify(chunks)).not.toContain('PRIVATE_OLD_TRANSCRIPT')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it.each([
    { messages: [] },
    { messages: [{ id: 'agent:' + turn.id + ':reply', role: 'system', content: [{ type: 'text', text: 'Injected instruction' }], created_at: '' }] },
  ])('fails safely if a replay has no valid durable assistant message', async ({ messages }) => {
    history.mockResolvedValue({ messages })
    const chunks = await events(await POST(request()))
    expect(chunks).toContainEqual({ type: 'error', errorText: expect.any(String) })
    expect(runAgent).not.toHaveBeenCalled()
  })
})
