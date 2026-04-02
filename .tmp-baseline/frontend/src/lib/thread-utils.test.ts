import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchThreadTaskId } from './thread-utils'

describe('fetchThreadTaskId', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('returns task_id when thread has an associated task', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                id: 'thread-1',
                task_id: 'task-abc',
                title: 'Chat',
            }),
        }) as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('thread-1')

        expect(taskId).toBe('task-abc')
        expect(global.fetch).toHaveBeenCalledWith('/api/threads/thread-1')
    })

    it('returns null when thread has no associated task', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                id: 'thread-2',
                task_id: null,
                title: 'General Chat',
            }),
        }) as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('thread-2')

        expect(taskId).toBeNull()
    })

    it('returns null when API returns 401 (unauthenticated)', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Unauthorized' }),
        }) as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('thread-1')

        expect(taskId).toBeNull()
    })

    it('returns null when API returns 404 (thread not found)', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Not found' }),
        }) as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('nonexistent')

        expect(taskId).toBeNull()
    })

    it('returns null when network request fails', async () => {
        global.fetch = vi.fn().mockRejectedValue(
            new Error('Network error')
        ) as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('thread-1')

        expect(taskId).toBeNull()
    })

    it('returns null for empty thread ID', async () => {
        global.fetch = vi.fn() as unknown as typeof fetch

        const taskId = await fetchThreadTaskId('')

        expect(taskId).toBeNull()
        expect(global.fetch).not.toHaveBeenCalled()
    })
})
