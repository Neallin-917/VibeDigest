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

import { GET } from './route'

describe('GET /api/chat/threads', () => {
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

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns active and archived threads while excluding deleted at query level', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'thread-active',
          title: 'Active chat',
          status: 'active',
          updated_at: '2026-04-18T10:00:00Z',
        },
        {
          id: 'thread-archived',
          title: 'Archived chat',
          status: 'archived',
          updated_at: '2026-04-17T10:00:00Z',
        },
      ],
      error: null,
    })
    const neqMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ neq: neqMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockFrom.mockReturnValue({ select: selectMock })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([
      expect.objectContaining({ id: 'thread-active', status: 'active' }),
      expect.objectContaining({ id: 'thread-archived', status: 'archived' }),
    ])
    expect(mockFrom).toHaveBeenCalledWith('chat_threads')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(neqMock).toHaveBeenCalledWith('status', 'deleted')
    expect(orderMock).toHaveBeenCalledWith('updated_at', { ascending: false })
  })

  it('returns 500 when the query fails', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })
    const neqMock = vi.fn().mockReturnValue({ order: orderMock })
    const eqMock = vi.fn().mockReturnValue({ neq: neqMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockFrom.mockReturnValue({ select: selectMock })

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to fetch threads' })
  })
})
