import { useCallback, useMemo, useState } from 'react'

import type { Thread } from '@/types'

const THREAD_LIST_BATCH_SIZE = 20

export function useProgressiveThreadList(
  threads: Thread[],
  selectedThreadId?: string | null,
) {
  const [visibleCount, setVisibleCount] = useState(THREAD_LIST_BATCH_SIZE)

  const visibleThreads = useMemo(() => {
    const recentThreads = threads.slice(0, visibleCount)

    if (!selectedThreadId || recentThreads.some((thread) => thread.id === selectedThreadId)) {
      return recentThreads
    }

    const selectedThread = threads.find((thread) => thread.id === selectedThreadId)
    return selectedThread ? [...recentThreads, selectedThread] : recentThreads
  }, [selectedThreadId, threads, visibleCount])

  const loadMore = useCallback(() => {
    setVisibleCount((currentCount) => currentCount + THREAD_LIST_BATCH_SIZE)
  }, [])

  return {
    visibleThreads,
    hasMore: visibleCount < threads.length,
    loadMore,
  }
}
