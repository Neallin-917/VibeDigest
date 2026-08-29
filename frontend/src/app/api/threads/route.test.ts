import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

import { GET, POST } from './route'

function listRequest(taskId?: string) {
  const url = new URL('http://localhost/api/threads')
  if (taskId) url.searchParams.set('taskId', taskId)
  return new NextRequest(url)
}

function mockListQuery(result: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(result)
  const neq = vi.fn().mockReturnValue({ order })
  const taskEq = vi.fn().mockReturnValue({ neq })
  const userEq = vi.fn().mockReturnValue({ eq: taskEq, neq })
  const select = vi.fn().mockReturnValue({ eq: userEq })
  mockFrom.mockReturnValue({ select })
  return { select, userEq, taskEq, neq, order }
}

describe('/api/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    const response = await GET(listRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('lists all owned non-deleted threads when taskId is absent', async () => {
    const threads = [
      { id: 'thread-1', task_id: null, status: 'active' },
      { id: 'thread-2', task_id: 'task-2', status: 'archived' },
    ]
    const query = mockListQuery({ data: threads, error: null })

    const response = await GET(listRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(threads)
    expect(query.select).toHaveBeenCalledWith(
      'id, title, task_id, status, created_at, updated_at',
    )
    expect(query.userEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(query.taskEq).not.toHaveBeenCalled()
    expect(query.neq).toHaveBeenCalledWith('status', 'deleted')
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })

  it('scopes the owned thread list when taskId is present', async () => {
    const query = mockListQuery({ data: [], error: null })

    const response = await GET(listRequest('task-1'))

    expect(response.status).toBe(200)
    expect(query.taskEq).toHaveBeenCalledWith('task_id', 'task-1')
  })

  it('returns 500 when the list query fails', async () => {
    mockListQuery({ data: null, error: { message: 'boom' } })

    const response = await GET(listRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch threads' })
  })

  it('rejects malformed create payloads', async () => {
    const request = new NextRequest('http://localhost/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Missing taskId' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('creates an owned task thread with a normalized title', async () => {
    const thread = { id: 'thread-1', task_id: 'task-1', title: 'Research' }
    const single = vi.fn().mockResolvedValue({ data: thread, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockFrom.mockReturnValue({ insert })
    const request = new NextRequest('http://localhost/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: ' task-1 ', title: ' Research ' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(thread)
    expect(insert).toHaveBeenCalledWith({
      task_id: 'task-1',
      user_id: 'user-1',
      title: 'Research',
    })
  })
})
