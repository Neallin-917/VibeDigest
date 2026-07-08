import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/backend-url', () => ({
  BACKEND_API_URL: 'http://localhost:8000',
}))

const { mockCreateClient, mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { POST } from './route'

const originalFetch = global.fetch

describe('POST /api/process-video', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
      },
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('does not proxy raw upstream HTML errors to the client', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>',
    } as Response)

    const req = new Request('http://localhost/api/process-video', {
      method: 'POST',
      body: JSON.stringify({ video_url: 'https://www.youtube.com/watch?v=hyqLNX3VExQ' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain('blocking automated access')
    expect(body.error).not.toContain('<!DOCTYPE')
    expect(body.error).not.toContain('challenge-platform')
  })
})
