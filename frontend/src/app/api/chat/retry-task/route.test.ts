import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/backend-url', () => ({
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

const { mockCreateClient, mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

const originalFetch = global.fetch

describe('POST /api/chat/retry-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(env as { NEXT_PUBLIC_E2E_MOCK: string }).NEXT_PUBLIC_E2E_MOCK = '0'
    ;(env as { NEXT_PUBLIC_LOCAL_DEMO: string }).NEXT_PUBLIC_LOCAL_DEMO = '0'
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
      },
    })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
    global.fetch = originalFetch
  })

  it('returns a deterministic success in local mock mode', async () => {
    ;(env as { NEXT_PUBLIC_E2E_MOCK: string }).NEXT_PUBLIC_E2E_MOCK = '1'
    global.fetch = vi.fn()

    const response = await POST(new Request('http://localhost/api/chat/retry-task', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Task retry queued' })
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards an authenticated retry with the task id only', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)

    const response = await POST(new Request('http://localhost/api/chat/retry-task', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/retry-task',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
      })
    )
    const request = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((request.body as FormData).get('task_id')).toBe('task-123')
  })

  it('requires an authenticated session outside local mock mode', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(new Request('http://localhost/api/chat/retry-task', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(response.status).toBe(401)
    expect(global.fetch).toBe(originalFetch)
  })

  it('does not expose internal exceptions while queuing a retry', async () => {
    mockCreateClient.mockRejectedValue(new Error('postgres://admin:secret@internal-db:5432/app'))

    const response = await POST(new Request('http://localhost/api/chat/retry-task', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-123' }),
      headers: { 'Content-Type': 'application/json' },
    }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.details).toBe('Unable to process this video right now.')
    expect(body.details).not.toContain('secret')
  })
})
