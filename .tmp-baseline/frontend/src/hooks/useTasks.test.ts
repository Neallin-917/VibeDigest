import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTasks } from './useTasks'

const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockUpdate = vi.fn()

const queryBuilder = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    limit: mockLimit,
    update: mockUpdate,
}

// Setup chain return values
mockSelect.mockReturnValue(queryBuilder)
mockEq.mockReturnValue(queryBuilder)
mockOrder.mockReturnValue(queryBuilder)
mockUpdate.mockReturnValue(queryBuilder)
mockLimit.mockResolvedValue({ data: [], error: null })

const mockSupabase = {
    auth: {
        getUser: mockGetUser
    },
    from: vi.fn(() => queryBuilder)
}

vi.mock('@/lib/supabase', () => ({
    createClient: () => mockSupabase
}))

describe('useTasks', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
        
        mockSelect.mockReturnValue(queryBuilder)
        mockEq.mockReturnValue(queryBuilder)
        mockOrder.mockReturnValue(queryBuilder)
        mockUpdate.mockReturnValue(queryBuilder)
        
        mockLimit.mockResolvedValue({ data: [], error: null })
    })

    it('fetches tasks on mount if shouldFetch is true', async () => {
        const mockTasks = [{ id: '1', video_title: 'Task 1' }]
        mockLimit.mockResolvedValue({ data: mockTasks, error: null })

        const { result } = renderHook(() => useTasks(true))

        expect(result.current.loading).toBe(true)

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.tasks).toEqual(mockTasks)
        expect(result.current.error).toBeNull()
    })

    it('does not fetch tasks if shouldFetch is false', async () => {
        renderHook(() => useTasks(false))
        expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('handles no user authenticated', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } })
        
        const { result } = renderHook(() => useTasks(true))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.tasks).toEqual([])
        expect(mockSelect).not.toHaveBeenCalled()
    })

    it('handles fetch error', async () => {
        const errorMsg = 'Network error'
        mockLimit.mockResolvedValue({ data: null, error: { message: errorMsg } })

        const { result } = renderHook(() => useTasks(true))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBe(errorMsg)
        expect(result.current.tasks).toEqual([])
    })

    it('deletes task optimistically and calls API', async () => {
        const initialTasks = [{ id: '1', video_title: 'Task 1' }, { id: '2', video_title: 'Task 2' }]
        mockLimit.mockResolvedValue({ data: initialTasks, error: null })
        
        const thenableQueryBuilder = {
            ...queryBuilder,
            then: (resolve: any) => resolve({ error: null })
        }
        mockEq.mockReturnValue(thenableQueryBuilder)
        mockUpdate.mockReturnValue(thenableQueryBuilder)

        const { result } = renderHook(() => useTasks(true))

        await waitFor(() => {
            expect(result.current.tasks).toHaveLength(2)
        })

        await act(async () => {
            await result.current.deleteTask('1')
        })

        expect(result.current.tasks).toHaveLength(1)
        expect(result.current.tasks[0].id).toBe('2')
        
        expect(mockUpdate).toHaveBeenCalledWith({ is_deleted: true })
        expect(mockEq).toHaveBeenCalledWith('id', '1')
    })

    it('reverts optimistic delete on error', async () => {
        const initialTasks = [{ id: '1', video_title: 'Task 1' }]
        mockLimit.mockResolvedValue({ data: initialTasks, error: null })

        const thenableErrorBuilder = {
            ...queryBuilder,
            then: (resolve: any) => resolve({ error: { message: 'Delete failed' } })
        }
        mockUpdate.mockReturnValue({
            eq: () => thenableErrorBuilder
        })

        const { result } = renderHook(() => useTasks(true))

        await waitFor(() => {
            expect(result.current.tasks).toHaveLength(1)
        })

        mockLimit.mockResolvedValue({ data: initialTasks, error: null })

        await act(async () => {
            await result.current.deleteTask('1')
        })

        await waitFor(() => {
            expect(result.current.tasks).toHaveLength(1)
        })
        
        expect(result.current.tasks[0].id).toBe('1')
    })
})
