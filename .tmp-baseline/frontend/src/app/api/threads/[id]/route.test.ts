import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// --- Hoisted mocks ---
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

// Import the handler under test (GET will be added alongside the existing DELETE)
import { GET } from './route'

describe('GET /api/threads/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // Default: authenticated user
        mockGetUser.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        })
    })

    it('returns 401 when user is not authenticated', async () => {
        mockGetUser.mockResolvedValue({
            data: { user: null },
            error: { message: 'No session' },
        })

        const req = new NextRequest('http://localhost/api/threads/thread-1')
        const res = await GET(req, { params: Promise.resolve({ id: 'thread-1' }) })

        expect(res.status).toBe(401)
    })

    it('returns 404 when thread does not exist or belongs to another user', async () => {
        mockFrom.mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: null,
                            error: { code: 'PGRST116', message: 'not found' },
                        }),
                    }),
                }),
            }),
        })

        const req = new NextRequest('http://localhost/api/threads/nonexistent')
        const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })

        expect(res.status).toBe(404)
    })

    it('returns thread with task_id when thread exists and belongs to user', async () => {
        const threadData = {
            id: 'thread-1',
            title: 'Chat about video',
            task_id: 'task-abc',
            status: 'active',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
        }

        mockFrom.mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: threadData,
                            error: null,
                        }),
                    }),
                }),
            }),
        })

        const req = new NextRequest('http://localhost/api/threads/thread-1')
        const res = await GET(req, { params: Promise.resolve({ id: 'thread-1' }) })
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.id).toBe('thread-1')
        expect(body.task_id).toBe('task-abc')
    })

    it('returns thread with null task_id when thread has no associated task', async () => {
        const threadData = {
            id: 'thread-2',
            title: 'General Chat',
            task_id: null,
            status: 'active',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
        }

        mockFrom.mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: threadData,
                            error: null,
                        }),
                    }),
                }),
            }),
        })

        const req = new NextRequest('http://localhost/api/threads/thread-2')
        const res = await GET(req, { params: Promise.resolve({ id: 'thread-2' }) })
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.id).toBe('thread-2')
        expect(body.task_id).toBeNull()
    })

    it('returns 500 when database query fails', async () => {
        mockFrom.mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'Database connection error' },
                        }),
                    }),
                }),
            }),
        })

        const req = new NextRequest('http://localhost/api/threads/thread-1')
        const res = await GET(req, { params: Promise.resolve({ id: 'thread-1' }) })

        expect(res.status).toBe(500)
    })
})
