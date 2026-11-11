import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }))
import { POST } from './route'
const request = (body: unknown, origin = 'https://www.vibedigest.io') => new Request('https://www.vibedigest.io/api/engagement', { method: 'POST', headers: { origin }, body: JSON.stringify(body) })
describe('engagement collector', () => {
 beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv('NEXT_PUBLIC_E2E_MOCK', ''); vi.stubEnv('VERCEL_ENV', 'production'); mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user' } }, error: null }); mocks.rpc.mockReset().mockResolvedValue({ error: null }) })
 it('rejects foreign origins before auth or database', async () => { expect((await POST(request({ event: 'visit' }, 'https://evil.example'))).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled() })
 it('rejects spoofed user IDs and missing task IDs', async () => { expect((await POST(request({ event: 'visit', userId: 'other' }))).status).toBe(400); expect((await POST(request({ event: 'result_view' }))).status).toBe(400) })
 it('requires verified authentication', async () => { mocks.getUser.mockResolvedValue({ data: { user: null }, error: null }); expect((await POST(request({ event: 'visit' }))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled() })
 it('uses session identity through RPC, never a caller user ID', async () => { expect((await POST(request({ event: 'visit' }))).status).toBe(204); expect(mocks.rpc).toHaveBeenCalledWith('record_ops_engagement', { p_event: 'visit', p_task_id: null }) })
 it('does not acknowledge failed writes', async () => { mocks.rpc.mockResolvedValue({ error: { message: 'not enabled' } }); expect((await POST(request({ event: 'visit' }))).status).toBe(503) })
 it('rejects preview and E2E events', async () => { vi.stubEnv('VERCEL_ENV', 'preview'); expect((await POST(request({ event: 'visit' }))).status).toBe(403) })
})
