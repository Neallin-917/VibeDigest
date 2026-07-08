import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { PATCH } from './route'

describe('PATCH /api/threads/[id]', () => {
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

    const req = new Request('http://localhost/api/threads/thread-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'thread-1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status', async () => {
    const req = new Request('http://localhost/api/threads/thread-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'thread-1' }) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid thread status' })
  })

  it('archives a thread owned by the current user', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        title: 'Old chat',
        status: 'archived',
        updated_at: '2026-04-19T00:00:00Z',
      },
      error: null,
    })
    const secondEqMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) })
    const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock })
    const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock })
    mockFrom.mockReturnValue({ update: updateMock })

    const req = new Request('http://localhost/api/threads/thread-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'thread-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({ id: 'thread-1', status: 'archived' }))
    expect(updateMock).toHaveBeenCalledWith({
      status: 'archived',
      updated_at: expect.any(String),
    })
    expect(firstEqMock).toHaveBeenCalledWith('id', 'thread-1')
    expect(secondEqMock).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('restores an archived thread to active', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        title: 'Archived chat',
        status: 'active',
        updated_at: '2026-04-19T00:00:00Z',
      },
      error: null,
    })
    const secondEqMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) })
    const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock })
    const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock })
    mockFrom.mockReturnValue({ update: updateMock })

    const req = new Request('http://localhost/api/threads/thread-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'thread-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({ id: 'thread-1', status: 'active' }))
  })

  it('returns 404 when the thread is not found for the current user', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    })
    const secondEqMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) })
    const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock })
    const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock })
    mockFrom.mockReturnValue({ update: updateMock })

    const req = new Request('http://localhost/api/threads/thread-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'thread-1' }) })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Thread not found' })
  })
})
