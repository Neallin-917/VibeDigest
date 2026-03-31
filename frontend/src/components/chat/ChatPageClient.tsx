"use client"

import { useState, useCallback, useEffect, useRef, useMemo, Suspense, startTransition } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { mapDBMessageToUIMessage, DBMessage } from "@/lib/chat-utils"
import type { UIMessage } from "ai"
import { v4 as uuidv4 } from 'uuid'
import { createClient } from "@/lib/supabase"
import { fetchThreadTaskId } from "@/lib/thread-utils"
import { env } from "@/env"

interface Thread {
    id: string
    title: string
    updated_at: string
    task_id?: string | null
}

interface ThreadPayload {
    taskId: string | null
    messages: UIMessage[]
    fetchedAt: number
}

const THREAD_PREFETCH_LIMIT = 3

function ChatPageContent() {
    const searchParams = useSearchParams()
    const { replace } = useRouter()
    const pathname = usePathname()
    const queryThreadId = searchParams.get("threadId")
    const queryTaskId = searchParams.get("task")
    const searchParamsString = searchParams.toString()

    // Auth state (null = loading, true/false = resolved)
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
        // E2E test mode: read auth state from VIBEDIGEST_E2E_AUTH_BYPASS cookie
        // This allows per-test control: isAuthenticated: true/false in setupApiMocks
        if (typeof document !== 'undefined' && env.NEXT_PUBLIC_E2E_MOCK === '1') {
            return document.cookie
                .split(';')
                .some(c => c.trim() === 'VIBEDIGEST_E2E_AUTH_BYPASS=true')
        }
        return null
    })
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        if (env.NEXT_PUBLIC_E2E_MOCK === '1') {
            return
        }
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsAuthenticated(!!user)
        })
    }, [supabase])

    // State
    const [threads, setThreads] = useState<Thread[]>([])
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
    const [activeTaskId, setActiveTaskId] = useState<string | null>(queryTaskId)
    const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
    const [pendingThreadId, setPendingThreadId] = useState<string | null>(null)
    const [isThreadSwitching, setIsThreadSwitching] = useState(false)
    const [taskSelectionNonce, setTaskSelectionNonce] = useState(0)
    const [isBootstrapping, setIsBootstrapping] = useState(true)
    // Track newly created thread IDs to skip loading
    const newThreadIdsRef = useRef<Set<string>>(new Set())
    const hasBootstrappedRef = useRef(false)
    const threadSelectionRequestIdRef = useRef(0)
    const threadPayloadCacheRef = useRef<Map<string, ThreadPayload>>(new Map())
    const threadLoadPromisesRef = useRef<Map<string, Promise<ThreadPayload>>>(new Map())
    // Flag to prevent main useEffect from re-running when user-initiated navigation
    // changes URL params. This relies on React 18+ automatic batching: setState calls
    // within the same event handler are batched, so the useEffect won't fire between
    // setActiveThreadId() and safeReplace() in handleSelectThread/handleNewChat/handleSelectTask.
    const isUserNavigatingRef = useRef(false)
    const latestSearchParamsRef = useRef(searchParamsString)
    // [Safety net] Navigation history for cycle detection — fallback defense-in-depth.
    // Primary protection is isUserNavigatingRef above; this catches unexpected edge cases.
    const navigationHistoryRef = useRef<Array<{ url: string; timestamp: number }>>([])
    const resolvedActiveThreadId = activeThreadId ?? queryThreadId
    const resolvedActiveTaskId = activeTaskId ?? queryTaskId
    const selectedThreadId = pendingThreadId ?? resolvedActiveThreadId
    const switchingThreadTitle = useMemo(
        () => threads.find((thread) => thread.id === pendingThreadId)?.title ?? null,
        [pendingThreadId, threads]
    )

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

        // [Safety net] Cycle detection: block oscillating URL navigations (defense-in-depth)
        const now = Date.now()
        const recentHistory = navigationHistoryRef.current.filter(
            (entry) => now - entry.timestamp < 2000 // 2 second window
        )

        // If this URL appears in recent history, it's likely a cycle
        const cycleDetected = recentHistory.some((entry) => entry.url === nextSearch)
        if (cycleDetected) {
            console.warn('[ChatPageClient] Navigation cycle detected, blocking navigation to:', nextSearch)
            console.warn('[ChatPageClient] Recent history:', recentHistory.map(e => e.url))
            return false
        }

        // Update navigation history
        navigationHistoryRef.current.push({ url: nextSearch, timestamp: now })
        // Keep only last 5 entries to prevent memory leak
        if (navigationHistoryRef.current.length > 5) {
            navigationHistoryRef.current.shift()
        }

        latestSearchParamsRef.current = nextSearch
        const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname
        replace(nextUrl, { scroll: false })
        return true
    }, [pathname, replace])

    // Fetch threads list (silently skipped for unauthenticated users)
    const fetchThreads = useCallback(async () => {
        try {
            const res = await fetch('/api/chat/threads')
            if (res.status === 401) {
                setThreads([])
                return
            }
            if (res.ok) {
                const data = await res.json()
                setThreads(data)
            }
        } catch (error) {
            console.error('Failed to fetch threads', error)
        }
    }, [])

    const fetchThreadMessages = useCallback(async (threadId: string): Promise<UIMessage[]> => {
        try {
            const res = await fetch(`/api/chat/threads/${threadId}/messages`)
            if (res.status === 401) {
                return []
            }
            if (res.ok) {
                const dbMessages: DBMessage[] = await res.json()
                return dbMessages.map(mapDBMessageToUIMessage)
            }
            return []
        } catch (error) {
            console.error('Failed to load thread messages', error)
            return []
        }
    }, [])

    const loadThreadMessages = useCallback(async (threadId: string) => {
        const uiMessages = await fetchThreadMessages(threadId)
        setInitialMessages(uiMessages)
    }, [fetchThreadMessages])

    const cacheThreadPayload = useCallback((threadId: string, payload: Omit<ThreadPayload, 'fetchedAt'>) => {
        const cachedPayload: ThreadPayload = {
            ...payload,
            fetchedAt: Date.now(),
        }
        threadPayloadCacheRef.current.set(threadId, cachedPayload)
        return cachedPayload
    }, [])

    const loadThreadPayload = useCallback(async (threadId: string): Promise<ThreadPayload> => {
        const cachedPayload = threadPayloadCacheRef.current.get(threadId)
        if (cachedPayload) {
            return cachedPayload
        }

        const inFlightPayload = threadLoadPromisesRef.current.get(threadId)
        if (inFlightPayload) {
            return inFlightPayload
        }

        const loadPromise = (async () => {
            const [taskId, messages] = await Promise.all([
                fetchThreadTaskId(threadId),
                fetchThreadMessages(threadId),
            ])

            return cacheThreadPayload(threadId, { taskId, messages })
        })()

        threadLoadPromisesRef.current.set(threadId, loadPromise)

        try {
            return await loadPromise
        } finally {
            if (threadLoadPromisesRef.current.get(threadId) === loadPromise) {
                threadLoadPromisesRef.current.delete(threadId)
            }
        }
    }, [cacheThreadPayload, fetchThreadMessages])

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

    const prefetchThread = useCallback((threadId: string) => {
        if (!threadId) return
        if (threadId === resolvedActiveThreadId) return
        if (newThreadIdsRef.current.has(threadId)) return

        void loadThreadPayload(threadId).catch((error) => {
            console.error('Failed to prefetch thread payload', error)
        })
    }, [loadThreadPayload, resolvedActiveThreadId])

    const resolveOrCreateThreadForTask = useCallback(async (taskId: string) => {
        try {
            const listRes = await fetch(`/api/threads?taskId=${encodeURIComponent(taskId)}`)
            if (listRes.status === 401) {
                // Unauthenticated: use a local ephemeral thread ID
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

        // Fallback for degraded mode: keep chat usable even if task-thread APIs fail.
        const fallbackId = uuidv4()
        newThreadIdsRef.current.add(fallbackId)
        return fallbackId
    }, [])

    // Keep local state synchronized with URL params and ensure a thread exists.
    useEffect(() => {
        // Skip if a user-initiated navigation (handleSelectThread/handleNewChat/handleSelectTask)
        // already handled state + URL updates — avoids duplicate fetches and race conditions.
        if (isUserNavigatingRef.current) {
            isUserNavigatingRef.current = false
            return
        }

        let cancelled = false

        const initialize = async () => {
            if (!hasBootstrappedRef.current) {
                setIsBootstrapping(true)
            }
            await fetchThreads()

            if (queryTaskId) {
                const resolvedThreadId = queryThreadId || await resolveOrCreateThreadForTask(queryTaskId)
                if (cancelled) return

                if (!newThreadIdsRef.current.has(resolvedThreadId)) {
                    const payload = await loadThreadPayload(resolvedThreadId)
                    if (cancelled) return

                    const cachedPayload = cacheThreadPayload(resolvedThreadId, {
                        taskId: queryTaskId,
                        messages: payload.messages,
                    })

                    setActiveThreadId(resolvedThreadId)
                    setActiveTaskId(queryTaskId)
                    setInitialMessages(cachedPayload.messages)
                } else {
                    setActiveThreadId(resolvedThreadId)
                    setActiveTaskId(queryTaskId)
                    setInitialMessages([])
                }

                const params = getCurrentParams()
                params.set("task", queryTaskId)
                params.set("threadId", resolvedThreadId)
                safeReplace(params)
            } else if (queryThreadId) {
                if (cancelled) return

                // Restore task association from the thread's persisted task_id
                if (!newThreadIdsRef.current.has(queryThreadId)) {
                    const payload = await loadThreadPayload(queryThreadId)
                    if (cancelled) return

                    setActiveThreadId(queryThreadId)
                    setActiveTaskId(payload.taskId)
                    setInitialMessages(payload.messages)

                    if (payload.taskId) {
                        const params = getCurrentParams()
                        params.set("task", payload.taskId)
                        params.set("threadId", queryThreadId)
                        safeReplace(params)
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
                const params = getCurrentParams()
                params.delete("task")
                params.set("threadId", newId)
                safeReplace(params)
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
    }, [
        fetchThreads,
        loadThreadMessages,
        pathname,
        queryTaskId,
        queryThreadId,
        resolveOrCreateThreadForTask,
        getCurrentParams,
        safeReplace,
    ])

    // Handle New Chat
    const handleNewChat = useCallback(() => {
        // Prevent main useEffect from re-running due to URL param changes
        isUserNavigatingRef.current = true

        const newId = uuidv4()

        // Mark as new thread to skip loading
        newThreadIdsRef.current.add(newId)
        threadSelectionRequestIdRef.current += 1

        // Update state first
        setActiveThreadId(newId)
        setActiveTaskId(null)
        setInitialMessages([])
        setPendingThreadId(null)
        setIsThreadSwitching(false)

        // Then update URL
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

        // Prevent main useEffect from re-running due to URL param changes
        isUserNavigatingRef.current = true

        // Remove from new threads set (in case it was added but now has messages)
        newThreadIdsRef.current.delete(threadId)

        setPendingThreadId(threadId)
        setIsThreadSwitching(true)

        const cachedPayload = threadPayloadCacheRef.current.get(threadId)
        if (cachedPayload) {
            commitThreadSelection(threadId, cachedPayload)
            return
        }

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
        }
    }, [commitThreadSelection, loadThreadPayload, pendingThreadId, resolvedActiveThreadId])

    // Handle Task Selection (from Sidebar or Workspace)
    const handleSelectTask = useCallback(async (taskId: string | null) => {
        // Prevent main useEffect from re-running due to URL param changes
        isUserNavigatingRef.current = true
        threadSelectionRequestIdRef.current += 1
        setPendingThreadId(null)
        setIsThreadSwitching(false)

        const params = getCurrentParams()

        if (!taskId) {
            // Case: Closing the panel / Deselecting task
            // Action: Keep current thread, just remove task param
            params.delete("task")
            setActiveTaskId(null)
            if (resolvedActiveThreadId) {
                params.set('threadId', resolvedActiveThreadId)
            }
            safeReplace(params)
            return
        }

        // Case: Selecting a task (History or Demo or Auto-open)
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
            await loadThreadMessages(resolvedThreadId)
        }

        fetchThreads()
    }, [fetchThreads, getCurrentParams, loadThreadMessages, resolveOrCreateThreadForTask, resolvedActiveThreadId, safeReplace])

    // Handle Demo Selection from Welcome Screen
    const handleSelectExample = useCallback(async (taskId: string) => {
        await handleSelectTask(taskId)
    }, [handleSelectTask])

    // Handle Chat Started (first message sent)
    const handleChatStarted = useCallback((threadId: string) => {
        // Remove from new threads set since it now has messages
        newThreadIdsRef.current.delete(threadId)
        threadPayloadCacheRef.current.delete(threadId)

        // Ensure URL is updated
        const params = getCurrentParams()
        if (params.get("threadId") !== threadId) {
            params.set('threadId', threadId)
            safeReplace(params)
        }

        // Refresh threads list
        fetchThreads()
    }, [fetchThreads, getCurrentParams, safeReplace])

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
            prefetchedThreadIds.forEach((threadId) => prefetchThread(threadId))
        })

        return () => {
            cancelIdle(idleHandle)
        }
    }, [prefetchThread, resolvedActiveThreadId, threads])

    return (
        <AppSidebarProvider defaultCollapsed={true}>
            <div className="h-screen w-full flex text-foreground overflow-hidden">
                {/* Global Sidebar */}
                <AppSidebar
                    threads={threads}
                    activeThreadId={resolvedActiveThreadId}
                    selectedThreadId={selectedThreadId}
                    onNewChat={handleNewChat}
                    onSelectThread={handleSelectThread}
                    onPrefetchThread={prefetchThread}
                />

                {/* Workspace */}
                {isBootstrapping ? (
                    <div className="flex-1 h-screen bg-background" />
                ) : (
                    <ChatWorkspace
                        activeThreadId={resolvedActiveThreadId}
                        selectedThreadId={selectedThreadId}
                        activeTaskId={resolvedActiveTaskId}
                        isThreadSwitching={isThreadSwitching}
                        switchingThreadTitle={switchingThreadTitle}
                        taskSelectionNonce={taskSelectionNonce}
                        initialMessages={initialMessages}
                        isAuthenticated={isAuthenticated ?? false}
                        onNewChat={handleNewChat}
                        onSelectThread={handleSelectThread}
                        onSelectTask={handleSelectTask}
                        onSelectExample={handleSelectExample}
                        onThreadCreated={fetchThreads}
                        onChatStarted={handleChatStarted}
                        threads={threads}
                    />
                )}
            </div>
        </AppSidebarProvider>
    )
}

export function ChatPageClient() {
    return (
        <Suspense fallback={<div className="h-screen w-full bg-background" />}>
            <ChatPageContent />
        </Suspense>
    )
}
