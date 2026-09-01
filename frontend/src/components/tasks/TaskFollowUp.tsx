'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { ChatContainer } from '@/components/chat/ChatContainer'
import { useAuth } from '@/hooks/useAuth'
import { useThreadPayload } from '@/hooks/useThreadPayload'
import { createTaskDataParts, type ChatUIMessage } from '@/lib/chat-ui'
import { isLocalUiDemo } from '@/lib/local-ui-demo'
import type { NormalizedTaskStatus } from '@/lib/safe-error'

type FollowUpCopy = {
  title: string
  restoring: string
  restoreFailed: string
}

type TaskFollowUpProps = {
  taskId: string
  taskStatus: NormalizedTaskStatus
  videoTitle: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  initialThreadId?: string | null
  sourceId: string
  copy: FollowUpCopy
}

type TaskThread = {
  id?: unknown
}

type ThreadLookup = {
  taskId: string
  threadId: string | null
  failed: boolean
}

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const subscribeToHydration = () => () => undefined

function normalizeThreadId(value: string | null | undefined) {
  return value && THREAD_ID_PATTERN.test(value) ? value : null
}

export function TaskFollowUp({
  taskId,
  taskStatus,
  videoTitle,
  videoUrl,
  thumbnailUrl,
  initialThreadId,
  sourceId,
  copy,
}: TaskFollowUpProps) {
  const { isAuthenticated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isDemo = isLocalUiDemo()
  const normalizedInitialThreadId = normalizeThreadId(initialThreadId)
  const [threadLookup, setThreadLookup] = useState<ThreadLookup | null>(null)
  const [startedThreadId, setStartedThreadId] = useState<string | null>(null)
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const shouldResolveLatestThread = isAuthenticated === true && !normalizedInitialThreadId && !isDemo

  useEffect(() => {
    if (!shouldResolveLatestThread) return

    const controller = new AbortController()

    const resolveLatestThread = async () => {
      try {
        const response = await fetch(`/api/threads?taskId=${encodeURIComponent(taskId)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          setThreadLookup({
            taskId,
            threadId: null,
            failed: response.status !== 401,
          })
          return
        }

        const threads = await response.json() as TaskThread[]
        if (controller.signal.aborted) return
        const latestThreadId = Array.isArray(threads)
          ? normalizeThreadId(typeof threads[0]?.id === 'string' ? threads[0].id : null)
          : null
        setThreadLookup({ taskId, threadId: latestThreadId, failed: false })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setThreadLookup({ taskId, threadId: null, failed: true })
        }
      }
    }

    void resolveLatestThread()
    return () => controller.abort()
  }, [shouldResolveLatestThread, taskId])

  const lookupForCurrentTask = threadLookup?.taskId === taskId ? threadLookup : null
  const threadId = startedThreadId
    ?? normalizedInitialThreadId
    ?? lookupForCurrentTask?.threadId
    ?? null
  const isResolvingThread = !hasHydrated || (!isDemo && isAuthenticated === null) || (
    shouldResolveLatestThread && !lookupForCurrentTask
  )

  const threadPayload = useThreadPayload(threadId, {
    enabled: isAuthenticated === true && Boolean(threadId) && !isResolvingThread,
  })
  const hasMismatchedTask = Boolean(
    threadId && threadPayload.taskId && threadPayload.taskId !== taskId
  )
  const canUseResolvedThread = Boolean(
    threadId && !threadPayload.error && !hasMismatchedTask
  )
  const isRestoringHistory = Boolean(
    isResolvingThread || (canUseResolvedThread && threadPayload.isLoading)
  )
  const restoreFailed = Boolean(
    (!startedThreadId && lookupForCurrentTask?.failed)
    || threadPayload.error
    || hasMismatchedTask
  )

  const statusMessage = useMemo<ChatUIMessage[]>(() => {
    if (taskStatus === 'completed') return []

    return [createTaskDataParts({
      messageId: `task-detail-${taskId}`,
      taskId,
      status: taskStatus,
      progress: taskStatus === 'processing' ? 1 : 0,
      videoTitle,
      videoUrl: videoUrl ?? undefined,
      thumbnailUrl: thumbnailUrl ?? undefined,
    })]
  }, [taskId, taskStatus, thumbnailUrl, videoTitle, videoUrl])

  const initialMessages = canUseResolvedThread
    ? threadPayload.messages
    : statusMessage

  const syncThreadIdToUrl = useCallback((nextThreadId: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set('threadId', nextThreadId)
    const search = params.toString()
    router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
  }, [pathname, router])

  const handleChatStarted = useCallback((nextThreadId: string) => {
    setStartedThreadId(nextThreadId)
    syncThreadIdToUrl(nextThreadId)
  }, [syncThreadIdToUrl])

  return (
    <section
      aria-labelledby="task-follow-up-title"
      className="border-t border-border/70 pt-8"
    >
      <div className="mb-4 max-w-2xl">
        <h2 id="task-follow-up-title" className="text-base font-semibold text-foreground">
          {copy.title}
        </h2>
      </div>

      {isRestoringHistory ? (
        <p className="flex min-h-12 items-center text-sm text-muted-foreground" role="status">
          {copy.restoring}
        </p>
      ) : (
        <>
          {restoreFailed ? (
            <p className="mb-4 text-sm text-muted-foreground" role="status">
              {copy.restoreFailed}
            </p>
          ) : null}
          <ChatContainer
            key={canUseResolvedThread ? threadId : `task-${taskId}`}
            variant="embedded"
            activeTaskId={taskId}
            threadId={canUseResolvedThread ? threadId : null}
            initialMessages={initialMessages}
            isAuthenticated={isAuthenticated}
            scope="source"
            sourceId={sourceId}
            showTaskArtifacts={taskStatus !== 'completed'}
            onChatStarted={handleChatStarted}
          />
        </>
      )}
    </section>
  )
}
