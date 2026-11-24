import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), backend: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/agent/backend', () => ({ agentBackend: mocks.backend, AgentServiceError: class extends Error {} }))

const id = '29c0dcda-9ea7-4644-9aba-a2dd749ecf80'
const origin = 'https://vibedigest.example'
const send = (body: unknown, source = origin) => POST(new Request(`${origin}/api/tasks/${id}/summary-version`, {
  method: 'POST', headers: { origin: source }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) })

describe('default digest language request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } })
    mocks.backend.mockResolvedValue({ taskId: id, locale: 'zh', status: 'pending' })
  })
  it('uses the verified identity for the automatic-only command', async () => {
    expect(await (await send({ locale: 'zh' })).json()).toEqual({ status: 'pending' })
    expect(mocks.backend).toHaveBeenCalledWith('/summary-locale', { userId: 'owner', taskId: id, locale: 'zh' }, expect.anything())
  })
  it('rejects unauthenticated, cross-origin, and forged requests before dispatch', async () => {
    expect((await send({ locale: 'en', userId: 'other' })).status).toBe(400)
    expect((await send({ locale: 'de' })).status).toBe(400)
    expect((await send({ locale: 'en' }, 'https://elsewhere.example')).status).toBe(403)
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await send({ locale: 'en' })).status).toBe(401)
    expect(mocks.backend).not.toHaveBeenCalled()
  })
})
