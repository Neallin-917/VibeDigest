import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { threadKeys } from './queryKeys'
import type { Thread } from '@/types'
import { isLocalUiDemo } from '@/lib/local-ui-demo'

type MutableThreadStatus = 'active' | 'archived'

async function fetchThreads(): Promise<Thread[]> {
    const res = await fetch('/api/threads')
    if (!res.ok) {
        throw new Error(`Failed to fetch threads: ${res.status}`)
    }

    const data: unknown = await res.json()
    if (!Array.isArray(data)) throw new Error('Invalid thread history response')
    return data as Thread[]
}

async function patchThreadStatus(threadId: string, status: MutableThreadStatus): Promise<Thread> {
    const res = await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    })

    if (!res.ok) {
        throw new Error(`Failed to update thread status: ${res.status}`)
    }

    return await res.json() as Thread
}

function sortThreadsByUpdatedAt(threads: Thread[]) {
    return [...threads].sort((left, right) => {
        const leftTime = new Date(left.updated_at).getTime()
        const rightTime = new Date(right.updated_at).getTime()
        return rightTime - leftTime
    })
}

/**
 * Manages the thread list via React Query.
 * Replaces manual fetchThreads + threads useState.
 *
 * - staleTime: 30s (thread list changes infrequently)
 * - refetchOnWindowFocus: catches updates from other tabs
 * - guest sessions do not request private history
 */
export function useThreadsQuery({ enabled = true }: { enabled?: boolean } = {}) {
    const queryClient = useQueryClient()
    const isDemo = isLocalUiDemo()

    const { data: threads = [], isLoading, isFetching, status } = useQuery({
        queryKey: threadKeys.all,
        queryFn: fetchThreads,
        enabled: !isDemo && enabled,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    })

    const refetch = useCallback(async (): Promise<Thread[]> => {
        if (isDemo || !enabled) return []

        const data = await queryClient.fetchQuery({
            queryKey: threadKeys.all,
            queryFn: fetchThreads,
        })
        return data
    }, [enabled, isDemo, queryClient])

    const updateThreadStatus = useCallback(async (threadId: string, status: MutableThreadStatus) => {
        const updatedThread = await patchThreadStatus(threadId, status)

        queryClient.setQueryData<Thread[]>(threadKeys.all, (currentThreads = []) => {
            const hasExistingThread = currentThreads.some((thread) => thread.id === updatedThread.id)
            const nextThreads = hasExistingThread
                ? currentThreads.map((thread) => (
                    thread.id === updatedThread.id
                        ? { ...thread, ...updatedThread }
                        : thread
                ))
                : [...currentThreads, updatedThread]

            return sortThreadsByUpdatedAt(nextThreads)
        })

        return updatedThread
    }, [queryClient])

    return { threads, isLoading, isFetching, status, refetch, updateThreadStatus }
}
