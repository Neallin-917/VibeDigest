import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/backend-url', () => ({
  BACKEND_API_URL: 'http://localhost:8000',
  SERVER_BACKEND_URL: 'http://localhost:8000',
}))

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_E2E_MOCK: '0',
    NEXT_PUBLIC_LOCAL_DEMO: '0',
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
  mockDeriveThreadTitle,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpsertChatState: vi.fn(),
  mockRestoreArchivedThreadIfNeeded: vi.fn(),
  mockDeriveThreadTitle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../persistence', () => ({
  upsertChatState: mockUpsertChatState,
  restoreArchivedThreadIfNeeded: mockRestoreArchivedThreadIfNeeded,
  deriveThreadTitle: mockDeriveThreadTitle,
}))

const originalFetch = global.fetch

describe('POST /api/chat/direct-submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(env as { NEXT_PUBLIC_E2E_MOCK: string }).NEXT_PUBLIC_E2E_MOCK = '0'
    ;(env as { NEXT_PUBLIC_LOCAL_DEMO: string }).NEXT_PUBLIC_LOCAL_DEMO = '0'

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
    mockDeriveThreadTitle.mockReturnValue('YouTube · hyqLNX3VExQ')
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

  it('does not expose upstream Cloudflare challenge HTML on task creation failure', async () => {
    const challengeHtml =
      '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>'
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => challengeHtml,
    } as Response)

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=hyqLNX3VExQ',
        originalText: 'https://www.youtube.com/watch?v=hyqLNX3VExQ',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body).toEqual(
      expect.objectContaining({
        error: 'Task creation failed',
        code: 'TASK_CREATION_FAILED',
        details: expect.stringContaining('blocking automated access'),
      })
    )
    expect(body.details).not.toContain('<!DOCTYPE')
    expect(body.details).not.toContain('challenge-platform')
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
    const assistantMessage = body.messages.find((message: { role: string }) => message.role === 'assistant')
    expect(assistantMessage.parts).toHaveLength(1)
    expect(assistantMessage.parts[0]).toEqual(
      expect.objectContaining({ type: 'data-task-status' })
    )
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
  })

  it('returns local demo task data without requiring Supabase or the backend', async () => {
    ;(env as { NEXT_PUBLIC_LOCAL_DEMO: string }).NEXT_PUBLIC_LOCAL_DEMO = '1'
    global.fetch = vi.fn()

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=demo',
        originalText: 'https://www.youtube.com/watch?v=demo',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.task_id).toMatch(/^task-/)
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockUpsertChatState).not.toHaveBeenCalled()
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
        threadTitle: 'Archived chat',
      })
    )
  })

  it('assigns a useful deterministic title to a new URL conversation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-123' }),
    } as Response)

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=hyqLNX3VExQ',
        originalText: 'https://www.youtube.com/watch?v=hyqLNX3VExQ',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockUpsertChatState).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        taskIdToBind: 'task-123',
        threadTitle: 'YouTube · hyqLNX3VExQ',
      })
    )
  })

  it('forwards the complete request and UI locale so the backend can persist output intent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-123' }),
    } as Response)

    const req = new Request('http://localhost/api/chat/direct-submit', {
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        videoUrl: 'https://www.youtube.com/watch?v=abc',
        originalText: 'Summarize this English video in Chinese: https://www.youtube.com/watch?v=abc',
        uiLocale: 'en',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const formData = options.body as FormData
    expect(formData.get('video_url')).toBe('https://www.youtube.com/watch?v=abc')
    expect(formData.get('request_text')).toBe(
      'Summarize this English video in Chinese: https://www.youtube.com/watch?v=abc'
    )
    expect(formData.get('ui_locale')).toBe('en')
  })
})
