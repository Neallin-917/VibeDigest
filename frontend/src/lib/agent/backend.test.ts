import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentBackend, AgentServiceError, createTurnClient, signAgentRequest, verifyAgentRequest, type AgentTurn } from './backend'

const { config, fetchMock } = vi.hoisted(() => ({
  config: {
    AGENT_INTERNAL_SECRET: 'test-only-agent-secret-with-at-least-32-characters' as string | undefined,
    BACKEND_API_URL: 'https://backend.example.test/base',
  },
  fetchMock: vi.fn(),
}))
vi.mock('@/env', () => ({ env: config }))

const now = 1_800_000_000
const secret = 'test-only-agent-secret-with-at-least-32-characters'
const path = '/api/internal/agent/continue'
const turn: AgentTurn = {
  id: '33333333-3333-4333-8333-333333333333',
  thread_id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  input_message_id: 'user-1', task_id: null, status: 'running', execution_token: 'private-execution-token',
  runtime_config: {
    runtime: 'api', provider: 'openrouter', model: 'fixture-smart', modelTier: 'smart',
    reasoningEffort: 'provider-default', locale: 'zh',
  },
}

function signedRequest(body = '{}', sentAt = String(now), signature?: string) {
  return new Request('https://frontend.example.test' + path, {
    method: 'POST', body,
    headers: {
      'x-agent-sent-at': sentAt,
      'x-agent-signature': signature ?? createHmac('sha256', secret)
        .update(`${sentAt}\nPOST\n${path}\n${body}`).digest('hex'),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
  config.AGENT_INTERNAL_SECRET = secret
  fetchMock.mockImplementation(async () => Response.json({ saved: true }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Agent service request signatures', () => {
  it('binds the exact timestamp, HTTP method, path and serialized body', () => {
    const body = '{"message":"你好"}'
    expect(signAgentRequest('POST', path, body, String(now))).toBe(
      createHmac('sha256', secret).update(`${now}\nPOST\n${path}\n${body}`).digest('hex'),
    )
    expect(verifyAgentRequest(signedRequest(body), body)).toBe(true)
    expect(verifyAgentRequest(signedRequest(body), '{"message":"modified"}')).toBe(false)
    const changedPath = new Request('https://frontend.example.test/wrong', signedRequest(body))
    expect(verifyAgentRequest(changedPath, body)).toBe(false)
    const changedMethod = new Request('https://frontend.example.test' + path, {
      method: 'PUT', body, headers: signedRequest(body).headers,
    })
    expect(verifyAgentRequest(changedMethod, body)).toBe(false)
  })

  it.each([String(now - 61), String(now + 61), '', 'not-a-time', '1.2', '-2', 'Infinity'])(
    'rejects expired or invalid timestamps: %s', sentAt => {
      expect(verifyAgentRequest(signedRequest('{}', sentAt), '{}')).toBe(false)
    },
  )

  it.each([now - 60, now + 60])('accepts the defined clock-skew boundary: %s', sentAt => {
    expect(verifyAgentRequest(signedRequest('{}', String(sentAt)), '{}')).toBe(true)
  })

  it.each(['', 'short', 'a'.repeat(64), '0'.repeat(128)])('rejects missing or invalid signatures without throwing', signature => {
    expect(verifyAgentRequest(signedRequest('{}', String(now), signature), '{}')).toBe(false)
  })

  it('fails closed without a configured shared secret', () => {
    const request = signedRequest()
    config.AGENT_INTERNAL_SECRET = undefined
    expect(verifyAgentRequest(request, '{}')).toBe(false)
    expect(() => signAgentRequest('POST', path, '{}', String(now))).toThrow(AgentServiceError)
  })
})

describe('signed backend transport', () => {
  it('uses the configured server origin, no-store and an authenticated JSON body', async () => {
    const payload = { userId: turn.user_id, text: 'source question' }
    await expect(agentBackend('/turns', payload)).resolves.toEqual({ saved: true })
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('https://backend.example.test/api/internal/agent/turns')
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store', body: JSON.stringify(payload) })
    expect(options.signal).toBeDefined()
    expect(new Headers(options.headers).get('x-agent-signature')).toBe(
      createHmac('sha256', secret).update(`${now}\nPOST\n${url.pathname}\n${JSON.stringify(payload)}`).digest('hex'),
    )
    expect(new Headers(options.headers).get('authorization')).toBeNull()
  })

  it.each([402, 403, 409, 500])('projects upstream %s into a safe error without reading its body', async status => {
    const response = new Response('postgres password=do-not-expose', { status })
    const readBody = vi.spyOn(response, 'json')
    fetchMock.mockResolvedValue(response)
    await expect(agentBackend('/turns', {})).rejects.toMatchObject({ status })
    expect(readBody).not.toHaveBeenCalled()
    await expect(agentBackend('/turns', {})).rejects.not.toThrow('do-not-expose')
  })

  it('does not make a network request when signing configuration is absent', async () => {
    config.AGENT_INTERNAL_SECRET = undefined
    await expect(agentBackend('/turns', {})).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('propagates transport failure for the caller to classify', async () => {
    const failure = new TypeError('offline')
    fetchMock.mockRejectedValue(failure)
    await expect(agentBackend('/turns', {})).rejects.toBe(failure)
  })
})

describe('turn-scoped client', () => {
  it('captures server-owned identity and locale for every operation', async () => {
    const client = createTurnClient(turn)
    await client.read('task-1')
    await client.read('task-1', true)
    await client.history()
    await client.submit('https://youtu.be/example', 'en')
    await client.watch('task-1')
    await client.finish([{ type: 'text', text: 'Answer' }], { model: 'fixture-smart' }, 'cancelled')
    const calls = fetchMock.mock.calls.map(args => {
      const [url, options] = args as [URL, RequestInit]
      return { path: url.pathname, payload: JSON.parse(String(options.body)) }
    })
    expect(calls.map(call => call.path.split('/').at(-1))).toEqual(['read', 'read', 'history', 'submit', 'watch', 'finish'])
    for (const call of calls) {
      expect(call.path).toContain('/turns/' + turn.id + '/')
      expect(call.payload).toMatchObject({ userId: turn.user_id, token: turn.execution_token })
    }
    expect(calls[0].payload).toMatchObject({ includeSource: false, locale: 'zh' })
    expect(calls[1].payload).toMatchObject({ includeSource: true, locale: 'zh' })
    expect(calls[3].payload).toMatchObject({ videoUrl: 'https://youtu.be/example', locale: 'en' })
    expect(calls[4].payload).toMatchObject({ taskId: 'task-1', locale: 'zh' })
    expect(calls[5].payload).toMatchObject({ parts: [{ type: 'text', text: 'Answer' }], errorCode: 'cancelled' })
  })

  it('cancels reads with the browser but keeps durable finish independent of it', async () => {
    const controller = new AbortController()
    const client = createTurnClient(turn, controller.signal)
    await client.history()
    controller.abort()
    await client.finish([], {}, 'cancelled')
    const readOptions = fetchMock.mock.calls[0][1] as RequestInit
    const finishOptions = fetchMock.mock.calls[1][1] as RequestInit
    expect(readOptions.signal?.aborted).toBe(true)
    expect(finishOptions.signal?.aborted).toBe(false)
    expect(finishOptions.signal).not.toBe(readOptions.signal)
  })
})
