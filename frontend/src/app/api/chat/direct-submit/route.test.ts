import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/backend-url', () => ({
  BACKEND_API_URL: 'http://localhost:8000',
}))

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_E2E_MOCK: '0',
  },
}))

import { env } from '@/env'
import { POST } from './route'

const {
  mockCreateClient,
  mockGetUser,
  mockGetSession,
  mockFrom,
  mockUpsert,
  mockUpsertChatState,
  mockRestoreArchivedThreadIfNeeded,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpsertChatState: vi.fn(),
  mockRestoreArchivedThreadIfNeeded: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../persistence', () => ({
  upsertChatState: mockUpsertChatState,
  restoreArchivedThreadIfNeeded: mockRestoreArchivedThreadIfNeeded,
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
    mockRestoreArchivedThreadIfNeeded.mockResolvedValue(null)
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

  it('returns mocked task data in E2E mode without calling backend or persistence', async () => {
    ;(env as { NEXT_PUBLIC_E2E_MOCK: string }).NEXT_PUBLIC_E2E_MOCK = '1'
    global.fetch = vi.fn()

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=e2e',
        originalText: 'https://www.youtube.com/watch?v=e2e',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.task_id).toMatch(/^task-/)
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=e2e' }],
        }),
        expect.objectContaining({
          role: 'assistant',
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: 'data-task-status',
              data: expect.objectContaining({
                taskId: body.task_id,
                videoUrl: 'https://www.youtube.com/watch?v=e2e',
                status: 'pending',
              }),
            }),
          ]),
        }),
      ])
    )
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockUpsertChatState).not.toHaveBeenCalled()
    ;(env as { NEXT_PUBLIC_E2E_MOCK: string }).NEXT_PUBLIC_E2E_MOCK = '0'
  })

  it('restores archived threads before persisting direct URL submission', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-123' }),
    } as Response)

    mockRestoreArchivedThreadIfNeeded.mockResolvedValue({
      id: 'thread-1',
      title: 'Archived chat',
      status: 'active',
    })

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

    expect(res.status).toBe(200)
    expect(mockRestoreArchivedThreadIfNeeded).toHaveBeenCalledWith({
      threadId: 'thread-1',
      userId: 'user-1',
      supabase: expect.any(Object),
    })
    expect(mockUpsertChatState).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        taskIdToBind: 'task-123',
      })
    )
  })
})
