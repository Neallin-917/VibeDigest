import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentServiceError } from '@/lib/agent/backend'
import { POST } from './route'

const { auth, backend } = vi.hoisted(() => ({ auth: vi.fn(), backend: vi.fn() }))
vi.mock('@/env', () => ({ env: { AGENT_INTERNAL_SECRET: 'test-only-agent-secret-at-least-32-characters' } }))
vi.mock('@/lib/agent/backend', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/agent/backend')>(), agentBackend: backend }))
vi.mock('../../../auth', () => ({ verifyAuth: auth, isAuthError: (value: object) => 'response' in value }))

const turnId = '33333333-3333-4333-8333-333333333333'
const userId = '22222222-2222-4222-8222-222222222222'
const request = () => new Request('https://frontend.example.test/api/chat/turns/' + turnId + '/cancel', {
  method: 'POST', body: JSON.stringify({ userId: 'attacker', token: 'invented', taskId: 'do-not-cancel-video' }),
})
const params = (id = turnId) => ({ params: Promise.resolve({ turnId: id }) })

beforeEach(() => {
  vi.resetAllMocks()
  auth.mockResolvedValue({ user: { id: userId } })
  backend.mockResolvedValue({ cancelled: true })
})

describe('POST /api/chat/turns/:turnId/cancel', () => {
  it('cancels only the named answer with authenticated identity, ignoring body-supplied authority', async () => {
    const response = await POST(request(), params())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cancelled: true })
    expect(backend).toHaveBeenCalledExactlyOnceWith('/turns/' + turnId + '/cancel', { userId })
  })

  it('returns authentication failure without a backend action', async () => {
    const response = Response.json({ error: 'Unauthorized' }, { status: 401 })
    auth.mockResolvedValue({ response })
    expect(await POST(request(), params())).toBe(response)
    expect(backend).not.toHaveBeenCalled()
  })

  it('rejects invalid path IDs before a backend action', async () => {
    expect((await POST(request(), params('../other'))).status).toBe(400)
    expect(backend).not.toHaveBeenCalled()
  })

  it('preserves idempotent already-cancelled response', async () => {
    backend.mockResolvedValue({ cancelled: false })
    expect(await (await POST(request(), params())).json()).toEqual({ cancelled: false })
  })

  it.each([403, 409, 503])('retains safe service status %s without exposing private details', async status => {
    backend.mockRejectedValue(new AgentServiceError(status))
    const response = await POST(request(), params())
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: 'Unable to cancel this answer.' })
  })

  it('sanitizes unexpected backend errors', async () => {
    backend.mockRejectedValue(new Error('PRIVATE_CONNECTION_STRING'))
    const response = await POST(request(), params())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('PRIVATE_CONNECTION_STRING')
  })
})
