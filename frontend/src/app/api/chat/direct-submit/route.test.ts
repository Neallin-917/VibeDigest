import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/backend-url', () => ({
  BACKEND_API_URL: 'http://localhost:8000',
}))

import { POST } from './route'

const {
  mockCreateClient,
  mockGetUser,
  mockGetSession,
  mockFrom,
  mockUpsert,
  mockUpsertChatState,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpsertChatState: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../persistence', () => ({
  upsertChatState: mockUpsertChatState,
}))

const originalFetch = global.fetch

describe('POST /api/chat/direct-submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFrom.mockReturnValue({
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      upsert: mockUpsert,
    })

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
      },
      from: mockFrom,
    })

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    })
    mockUpsertChatState.mockResolvedValue(undefined)
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns explicit task-creation errors and does not persist chat state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream exploded',
    } as Response)

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=abc',
        originalText: 'https://www.youtube.com/watch?v=abc',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual(
      expect.objectContaining({
        error: 'Task creation failed',
        code: 'TASK_CREATION_FAILED',
        details: 'upstream exploded',
      })
    )
    expect(mockUpsertChatState).not.toHaveBeenCalled()
  })
})
