import { useState, useCallback, useEffect, useRef, useMemo, startTransition } from "react"
import { toast } from "sonner"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { v4 as uuidv4 } from 'uuid'
import { useLoadThreadPayload, usePrefetchThread, useInvalidateThreadPayload, type ThreadPayload } from "./useThreadPayload"
import type { ChatUIMessage } from "@/lib/chat-ui"
import type { Thread } from "@/types"

const THREAD_PREFETCH_LIMIT = 3

interface UseThreadNavigationOptions {
    threads: Thread[]
    refetchThreads: () => Promise<Thread[]>
}

export interface ThreadNavigationState {
    activeThreadId: string | null
    activeTaskId: string | null
    selectedThreadId: string | null
    isThreadSwitching: boolean
    switchingThreadTitle: string | null
    isBootstrapping: boolean
    taskSelectionNonce: number
    initialMessages: ChatUIMessage[]
    handleNewChat: () => void
    handleSelectThread: (threadId: string) => Promise<void>
    handleSelectTask: (taskId: string | null) => Promise<void>
    handleSelectExample: (taskId: string) => Promise<void>
    handleChatStarted: (threadId: string, taskId?: string) => void
    prefetchThread: (threadId: string) => void
}

/**
 * Core navigation state machine for thread management.
 * Manages URL sync, thread selection, new chat creation, task resolution,
 * and idle prefetching.
 *
 * Extracted from ChatPageClient to reduce its size from 600+ to ~80 lines.
 */
export function useThreadNavigation({
    threads,
    refetchThreads,
}: UseThreadNavigationOptions): ThreadNavigationState {
    const searchParams = useSearchParams()
    const { replace } = useRouter()
    const pathname = usePathname()
    const queryThreadId = searchParams.get("threadId")
    const queryTaskId = searchParams.get("task")
    const searchParamsString = searchParams.toString()

    const loadThreadPayload = useLoadThreadPayload()
    const prefetchThreadFn = usePrefetchThread()
    const invalidateThreadPayload = useInvalidateThreadPayload()

    // State
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
    const [activeTaskId, setActiveTaskId] = useState<string | null>(queryTaskId)
    const [initialMessages, setInitialMessages] = useState<ChatUIMessage[]>([])
    const [pendingThreadId, setPendingThreadId] = useState<string | null>(null)
    const [isThreadSwitching, setIsThreadSwitching] = useState(false)
    const [taskSelectionNonce, setTaskSelectionNonce] = useState(0)
    const [isBootstrapping, setIsBootstrapping] = useState(true)

    // Refs
    const newThreadIdsRef = useRef<Set<string>>(new Set())
    const hasBootstrappedRef = useRef(false)
    const threadSelectionRequestIdRef = useRef(0)
    // Flag to prevent main useEffect from re-running when user-initiated navigation
    // changes URL params. Relies on React 18+ automatic batching.
    const isUserNavigatingRef = useRef(false)
    const latestSearchParamsRef = useRef(searchParamsString)
    // Navigation history for cycle detection (defense-in-depth)
    const navigationHistoryRef = useRef<Array<{ url: string; timestamp: number }>>([])

    // Stable refs for functions used inside the init effect.
    // This prevents effect re-runs caused by unstable function references
    // (e.g. React Query hooks returning new callbacks on cache updates).
    const refetchThreadsRef = useRef(refetchThreads)
    const loadThreadPayloadRef = useRef(loadThreadPayload)
    const resolveOrCreateThreadForTaskRef = useRef<(taskId: string) => Promise<string>>(() => Promise.resolve(''))
    const safeReplaceRef = useRef<(params: URLSearchParams) => boolean>(() => false)
    const getCurrentParamsRef = useRef<() => URLSearchParams>(() => new URLSearchParams())

    // Derived state
    const resolvedActiveThreadId = activeThreadId ?? queryThreadId
    const resolvedActiveTaskId = activeTaskId ?? queryTaskId
    const selectedThreadId = pendingThreadId ?? resolvedActiveThreadId
    const switchingThreadTitle = useMemo(
        () => threads.find((thread) => thread.id === pendingThreadId)?.title ?? null,
        [pendingThreadId, threads]
    )

    // Keep latestSearchParamsRef in sync
    useEffect(() => {
        latestSearchParamsRef.current = searchParamsString
    }, [searchParamsString])

    const getCurrentParams = useCallback(() => {
        return new URLSearchParams(latestSearchParamsRef.current)
    }, [])

    const safeReplace = useCallback((params: URLSearchParams) => {
        const nextSearch = params.toString()
        const currentSearch = latestSearchParamsRef.current
        if (nextSearch === currentSearch) return false

        const now = Date.now()
        const recentHistory = navigationHistoryRef.current.filter(
            (entry) => now - entry.timestamp < 2000
        )

        const cycleDetected = recentHistory.some((entry) => entry.url === nextSearch)
        if (cycleDetected) {
            console.warn('[useThreadNavigation] Navigation cycle detected, blocking:', nextSearch)
            return false
        }

        navigationHistoryRef.current.push({ url: nextSearch, timestamp: now })
        if (navigationHistoryRef.current.length > 5) {
            navigationHistoryRef.current.shift()
        }

        latestSearchParamsRef.current = nextSearch
        const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname
        replace(nextUrl, { scroll: false })
        return true
    }, [pathname, replace])

    const commitThreadSelection = useCallback((threadId: string, payload: ThreadPayload) => {
        startTransition(() => {
            setActiveThreadId(threadId)
            setActiveTaskId(payload.taskId)
            setInitialMessages(payload.messages)
            setPendingThreadId(null)
            setIsThreadSwitching(false)
        })

        const params = getCurrentParams()
        if (payload.taskId) {
            params.set("task", payload.taskId)
        } else {
            params.delete("task")
        }
        params.set("threadId", threadId)
        safeReplace(params)
    }, [getCurrentParams, safeReplace])

    const resolveOrCreateThreadForTask = useCallback(async (taskId: string) => {
        try {
            const listRes = await fetch(`/api/threads?taskId=${encodeURIComponent(taskId)}`)
            if (listRes.status === 401) {
                const fallbackId = uuidv4()
                newThreadIdsRef.current.add(fallbackId)
                return fallbackId
            }
            if (listRes.ok) {
                const taskThreads: Thread[] = await listRes.json()
                if (Array.isArray(taskThreads) && taskThreads.length > 0 && taskThreads[0]?.id) {
                    return taskThreads[0].id
                }
            }
        } catch (error) {
            console.error('Failed to resolve task threads', error)
        }

        try {
            const createRes = await fetch('/api/threads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId }),
            })

            if (createRes.status === 401) {
                const fallbackId = uuidv4()
                newThreadIdsRef.current.add(fallbackId)
                return fallbackId
            }

            if (createRes.ok) {
                const createdThread: Thread = await createRes.json()
                if (createdThread?.id) {
                    return createdThread.id
                }
            }
        } catch (error) {
            console.error('Failed to create task thread', error)
        }

        const fallbackId = uuidv4()
        newThreadIdsRef.current.add(fallbackId)
        return fallbackId
    }, [])

    useEffect(() => {
        refetchThreadsRef.current = refetchThreads
        loadThreadPayloadRef.current = loadThreadPayload
        safeReplaceRef.current = safeReplace
        getCurrentParamsRef.current = getCurrentParams
        resolveOrCreateThreadForTaskRef.current = resolveOrCreateThreadForTask
    }, [
        getCurrentParams,
        loadThreadPayload,
        refetchThreads,
        resolveOrCreateThreadForTask,
        safeReplace,
    ])

    // Main initialization effect — syncs local state with URL params
    useEffect(() => {
        if (isUserNavigatingRef.current) {
            isUserNavigatingRef.current = false
            return
        }

        let cancelled = false

        const initialize = async () => {
            if (!hasBootstrappedRef.current) {
                setIsBootstrapping(true)
            }
            const fetchedThreads = await refetchThreadsRef.current()

            if (queryTaskId) {
                const resolvedThreadId = queryThreadId || await resolveOrCreateThreadForTaskRef.current(queryTaskId)
                if (cancelled) return

                if (!newThreadIdsRef.current.has(resolvedThreadId)) {
                    const payload = await loadThreadPayloadRef.current(resolvedThreadId)
                    if (cancelled) return

                    setActiveThreadId(resolvedThreadId)
                    setActiveTaskId(queryTaskId)
                    setInitialMessages(payload.messages)
                } else {
                    setActiveThreadId(resolvedThreadId)
                    setActiveTaskId(queryTaskId)
                    setInitialMessages([])
                }

                const params = getCurrentParamsRef.current()
                params.set("task", queryTaskId)
                params.set("threadId", resolvedThreadId)
                safeReplaceRef.current(params)
            } else if (queryThreadId) {
                if (cancelled) return

                if (!fetchedThreads.some((thread) => thread.id === queryThreadId)) {
                    newThreadIdsRef.current.add(queryThreadId)
                    setActiveThreadId(queryThreadId)
                    setActiveTaskId(null)
                    setInitialMessages([])
                    if (cancelled) return
                    hasBootstrappedRef.current = true
                    setIsBootstrapping(false)
                    return
                }

                if (!newThreadIdsRef.current.has(queryThreadId)) {
                    const payload = await loadThreadPayloadRef.current(queryThreadId)
                    if (cancelled) return

                    setActiveThreadId(queryThreadId)
                    setActiveTaskId(payload.taskId)
                    setInitialMessages(payload.messages)

                    if (payload.taskId) {
                        const params = getCurrentParamsRef.current()
                        params.set("task", payload.taskId)
                        params.set("threadId", queryThreadId)
                        safeReplaceRef.current(params)
                    } else {
                        setActiveTaskId(null)
                    }
                } else {
                    setActiveThreadId(queryThreadId)
                    setActiveTaskId(null)
                    setInitialMessages([])
                }
            } else {
                const newId = uuidv4()
                newThreadIdsRef.current.add(newId)
                if (cancelled) return

                setActiveTaskId(null)
                setActiveThreadId(newId)
                setInitialMessages([])
                const params = getCurrentParamsRef.current()
                params.delete("task")
                params.set("threadId", newId)
                safeReplaceRef.current(params)
            }

            if (!cancelled) {
                hasBootstrappedRef.current = true
                setIsBootstrapping(false)
            }
        }

        initialize()

        return () => {
            cancelled = true
        }
    }, [queryTaskId, queryThreadId])

    // Handle New Chat
    const handleNewChat = useCallback(() => {
        isUserNavigatingRef.current = true

        const newId = uuidv4()
        newThreadIdsRef.current.add(newId)
        threadSelectionRequestIdRef.current += 1

        setActiveThreadId(newId)
        setActiveTaskId(null)
        setInitialMessages([])
        setPendingThreadId(null)
        setIsThreadSwitching(false)

        const params = getCurrentParams()
        params.delete("task")
        params.set("threadId", newId)
        safeReplace(params)
    }, [getCurrentParams, safeReplace])

    // Handle Thread Selection (from sidebar)
    const handleSelectThread = useCallback(async (threadId: string) => {
        if (!threadId || threadId === resolvedActiveThreadId || threadId === pendingThreadId) {
            return
        }

        const requestId = ++threadSelectionRequestIdRef.current
        isUserNavigatingRef.current = true
        newThreadIdsRef.current.delete(threadId)

        setPendingThreadId(threadId)
        setIsThreadSwitching(true)

        try {
            const payload = await loadThreadPayload(threadId)

            if (requestId !== threadSelectionRequestIdRef.current) {
                return
            }

            commitThreadSelection(threadId, payload)
        } catch (error) {
            console.error('Failed to switch thread', error)
            if (requestId !== threadSelectionRequestIdRef.current) {
                return
            }
            isUserNavigatingRef.current = false
            setPendingThreadId(null)
            setIsThreadSwitching(false)
            toast.error('Failed to load chat history')
        }
    }, [commitThreadSelection, loadThreadPayload, pendingThreadId, resolvedActiveThreadId])

    // Handle Task Selection (from Sidebar or Workspace)
    const handleSelectTask = useCallback(async (taskId: string | null) => {
        isUserNavigatingRef.current = true
        threadSelectionRequestIdRef.current += 1
        setPendingThreadId(null)
        setIsThreadSwitching(false)

        const params = getCurrentParams()

        if (!taskId) {
            params.delete("task")
            setActiveTaskId(null)
            if (resolvedActiveThreadId) {
                params.set('threadId', resolvedActiveThreadId)
            }
            safeReplace(params)
            return
        }

        setTaskSelectionNonce((prev) => prev + 1)
        setActiveTaskId(taskId)
        params.set('task', taskId)

        const resolvedThreadId = await resolveOrCreateThreadForTask(taskId)
        const isEphemeralThread = newThreadIdsRef.current.has(resolvedThreadId)
        newThreadIdsRef.current.delete(resolvedThreadId)

        setActiveThreadId(resolvedThreadId)
        params.set('threadId', resolvedThreadId)
        safeReplace(params)

        if (isEphemeralThread) {
            setInitialMessages([])
        } else {
            const payload = await loadThreadPayload(resolvedThreadId)
            setInitialMessages(payload.messages)
        }

        refetchThreads()
    }, [refetchThreads, getCurrentParams, loadThreadPayload, resolveOrCreateThreadForTask, resolvedActiveThreadId, safeReplace])

    // Handle Demo Selection from Welcome Screen
    const handleSelectExample = useCallback(async (taskId: string) => {
        await handleSelectTask(taskId)
    }, [handleSelectTask])

    // Handle Chat Started (first message sent, optionally with a newly created task)
    const handleChatStarted = useCallback((threadId: string, taskId?: string) => {
        newThreadIdsRef.current.delete(threadId)
        invalidateThreadPayload(threadId)

        const params = getCurrentParams()
        if (params.get("threadId") !== threadId) {
            params.set('threadId', threadId)
        }

        if (taskId) {
            params.set('task', taskId)
            setActiveTaskId(taskId)
            setTaskSelectionNonce((prev) => prev + 1)
        }

        safeReplace(params)
        refetchThreads()
    }, [invalidateThreadPayload, refetchThreads, getCurrentParams, safeReplace])

    // Idle prefetch for top threads
    useEffect(() => {
        if (threads.length === 0) return

        const prefetchedThreadIds = threads
            .filter((thread) => thread.id !== resolvedActiveThreadId)
            .slice(0, THREAD_PREFETCH_LIMIT)
            .map((thread) => thread.id)

        if (prefetchedThreadIds.length === 0) return

        const requestIdle = window.requestIdleCallback
            ? window.requestIdleCallback.bind(window)
            : ((callback: IdleRequestCallback) => window.setTimeout(
                () => callback({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline),
                120
            ))
        const cancelIdle = window.cancelIdleCallback
            ? window.cancelIdleCallback.bind(window)
            : window.clearTimeout.bind(window)

        const idleHandle = requestIdle(() => {
            prefetchedThreadIds.forEach((threadId) => prefetchThreadFn(threadId))
        })

        return () => {
            cancelIdle(idleHandle)
        }
    }, [prefetchThreadFn, resolvedActiveThreadId, threads])

    return {
        activeThreadId: resolvedActiveThreadId,
        activeTaskId: resolvedActiveTaskId,
        selectedThreadId,
        isThreadSwitching,
        switchingThreadTitle,
        isBootstrapping,
        taskSelectionNonce,
        initialMessages,
        handleNewChat,
        handleSelectThread,
        handleSelectTask,
        handleSelectExample,
        handleChatStarted,
        prefetchThread: prefetchThreadFn,
    }
}
