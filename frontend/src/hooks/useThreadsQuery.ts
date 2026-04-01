import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { threadKeys } from './queryKeys'
import type { Thread } from '@/types'

async function fetchThreads(): Promise<Thread[]> {
    try {
        const res = await fetch('/api/chat/threads')
        if (res.status === 401) {
            return []
        }
        if (res.ok) {
            const data = await res.json()
            return Array.isArray(data) ? data : []
        }
    } catch (error) {
        console.error('Failed to fetch threads', error)
    }
    return []
}

/**
 * Manages the thread list via React Query.
 * Replaces manual fetchThreads + threads useState.
 *
 * - staleTime: 30s (thread list changes infrequently)
 * - refetchOnWindowFocus: catches updates from other tabs
 * - 401 responses gracefully return empty array
 */
export function useThreadsQuery() {
    const queryClient = useQueryClient()

    const { data: threads = [], isLoading } = useQuery({
        queryKey: threadKeys.all,
        queryFn: fetchThreads,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    })

    const refetch = useCallback(async (): Promise<Thread[]> => {
        const data = await queryClient.fetchQuery({
            queryKey: threadKeys.all,
            queryFn: fetchThreads,
        })
        return data
    }, [queryClient])

    return { threads, isLoading, refetch }
}
