import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { threadKeys } from './queryKeys'
import { fetchThreadTaskId } from '@/lib/thread-utils'
import type { ChatUIMessage } from '@/lib/chat-ui'

export interface ThreadPayload {
    taskId: string | null
    messages: ChatUIMessage[]
}

async function fetchThreadMessages(threadId: string): Promise<ChatUIMessage[]> {
    try {
        const res = await fetch(`/api/chat/threads/${threadId}/messages`)
        if (res.status === 401) {
            return []
        }
        if (res.ok) {
            return await res.json() as ChatUIMessage[]
        }
        return []
    } catch (error) {
        console.error('Failed to load thread messages', error)
        return []
    }
}

async function fetchThreadPayload(threadId: string): Promise<ThreadPayload> {
    const [taskId, messages] = await Promise.all([
        fetchThreadTaskId(threadId),
        fetchThreadMessages(threadId),
    ])
    return { taskId, messages }
}

/**
 * Loads a thread's messages and task association via React Query.
 * Replaces manual threadPayloadCacheRef + threadLoadPromisesRef.
 *
 * - staleTime: 5 min (messages rarely change externally)
 * - Automatic request deduplication (replaces threadLoadPromisesRef)
 * - Automatic cache expiry (replaces unchecked fetchedAt)
 */
export function useThreadPayload(threadId: string | null, options?: { enabled?: boolean }) {
    const enabled = (options?.enabled ?? true) && !!threadId

    const { data, isLoading, error } = useQuery({
        queryKey: threadKeys.payload(threadId ?? ''),
        queryFn: () => fetchThreadPayload(threadId!),
        enabled,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    })

    return {
        messages: data?.messages ?? [],
        taskId: data?.taskId ?? null,
        isLoading,
        error,
    }
}

/**
 * Returns a prefetch function for eagerly loading thread payloads.
 * Replaces manual prefetchThread + idle callback pattern.
 */
export function usePrefetchThread() {
    const queryClient = useQueryClient()

    return useCallback((threadId: string) => {
        if (!threadId) return
        void queryClient.prefetchQuery({
            queryKey: threadKeys.payload(threadId),
            queryFn: () => fetchThreadPayload(threadId),
            staleTime: 5 * 60 * 1000,
        })
    }, [queryClient])
}

/**
 * Returns a function to load thread payload imperatively (for handlers).
 * Uses ensureQueryData to leverage the cache and return data directly.
 */
export function useLoadThreadPayload() {
    const queryClient = useQueryClient()

    return useCallback(async (threadId: string): Promise<ThreadPayload> => {
        return queryClient.ensureQueryData({
            queryKey: threadKeys.payload(threadId),
            queryFn: () => fetchThreadPayload(threadId),
            staleTime: 5 * 60 * 1000,
        })
    }, [queryClient])
}

/**
 * Returns a function to invalidate a specific thread's cached payload.
 */
export function useInvalidateThreadPayload() {
    const queryClient = useQueryClient()

    return useCallback((threadId: string) => {
        queryClient.removeQueries({ queryKey: threadKeys.payload(threadId) })
    }, [queryClient])
}
