"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useI18n } from "@/components/i18n/I18nProvider"

export type NotificationPermissionStatus = "default" | "granted" | "denied" | "unsupported"

const STORAGE_KEY = "antigravity_task_subscriptions"
const EVENT_KEY = "antigravity_task_subscriptions_updated"
const MAX_SUBSCRIPTIONS = 200
const SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000

type SubscriptionRecord = Record<string, number>
type StoredSubscriptions = string[] | { ids?: SubscriptionRecord }

function areSubscriptionRecordsEqual(a: SubscriptionRecord, b: SubscriptionRecord): boolean {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
        if (a[key] !== b[key]) return false
    }

    return true
}

function pruneSubscriptions(record: SubscriptionRecord, now: number): SubscriptionRecord {
    const activeEntries = Object.entries(record)
        .filter(([, ts]) => Number.isFinite(ts) && now - ts <= SUBSCRIPTION_TTL_MS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SUBSCRIPTIONS)

    return Object.fromEntries(activeEntries)
}

function parseStoredSubscriptions(raw: string | null, now: number): SubscriptionRecord {
    if (!raw) return {}

    try {
        const parsed = JSON.parse(raw) as StoredSubscriptions

        // Backward-compatible with the legacy format: ["taskId1", "taskId2"]
        if (Array.isArray(parsed)) {
            const fromArray = Object.fromEntries(
                parsed
                    .filter((id): id is string => typeof id === "string" && id.length > 0)
                    .map((id) => [id, now])
            )
            return pruneSubscriptions(fromArray, now)
        }

        if (parsed && typeof parsed === "object" && parsed.ids && typeof parsed.ids === "object") {
            return pruneSubscriptions(parsed.ids, now)
        }
    } catch (e) {
        console.error("Failed to parse task subscriptions", e)
    }

    return {}
}

export function useTaskNotification() {
    const { t } = useI18n()
    const [permission, setPermission] = useState<NotificationPermissionStatus>("default")
    // Keep timestamps to support TTL and bounded growth.
    const [subscriptions, setSubscriptions] = useState<SubscriptionRecord>({})
    const [loadedFromStorage, setLoadedFromStorage] = useState(false)

    const subbedTaskIds = useMemo(() => new Set(Object.keys(subscriptions)), [subscriptions])

    useEffect(() => {
        // Handle initial permission state
        if (typeof window !== "undefined" && "Notification" in window) {
            const current = window.Notification.permission as NotificationPermissionStatus
            setPermission(prev => prev !== current ? current : prev)
        } else {
            setPermission(prev => prev !== "unsupported" ? "unsupported" : prev)
            return
        }

        // Load from localStorage
        const loadFromStorage = () => {
            try {
                const now = Date.now()
                const next = parseStoredSubscriptions(localStorage.getItem(STORAGE_KEY), now)
                setSubscriptions((prev) => areSubscriptionRecordsEqual(prev, next) ? prev : next)
            } catch (e) {
                console.error("Failed to load task subscriptions", e)
            } finally {
                setLoadedFromStorage(true)
            }
        }

        loadFromStorage()

        // Listen for storage changes (cross-tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                loadFromStorage()
            }
        }

        // Listen for local changes (same-tab)
        const handleLocalChange = () => {
            loadFromStorage()
        }

        window.addEventListener("storage", handleStorageChange)
        window.addEventListener(EVENT_KEY, handleLocalChange)

        return () => {
            window.removeEventListener("storage", handleStorageChange)
            window.removeEventListener(EVENT_KEY, handleLocalChange)
        }
    }, [])

    useEffect(() => {
        if (!loadedFromStorage) return

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: subscriptions }))
            window.dispatchEvent(new Event(EVENT_KEY))
        } catch (e) {
            console.error("Failed to save task subscriptions", e)
        }
    }, [loadedFromStorage, subscriptions])

    const requestPermission = useCallback(async () => {
        if (!("Notification" in window)) return "unsupported"

        try {
            const result = await window.Notification.requestPermission()
            setPermission(result as NotificationPermissionStatus)
            return result
        } catch (error) {
            console.error("Failed to request notification permission:", error)
            return "denied"
        }
    }, [])

    const subscribeToTask = useCallback(async (taskId: string) => {
        const now = Date.now()
        setSubscriptions((prev) => pruneSubscriptions({ ...prev, [taskId]: now }, now))

        if (permission === "default") {
            const newPermission = await requestPermission()
            if (newPermission !== "granted") {
                setSubscriptions((prev) => {
                    const { [taskId]: removedTaskId, ...rest } = prev
                    void removedTaskId
                    return rest
                })
                return false
            }
        } else if (permission !== "granted") {
            setSubscriptions((prev) => {
                const { [taskId]: removedTaskId, ...rest } = prev
                void removedTaskId
                return rest
            })
            return false
        }

        return true
    }, [permission, requestPermission])

    const unsubscribeFromTask = useCallback((taskId: string) => {
        setSubscriptions((prev) => {
            const { [taskId]: removedTaskId, ...rest } = prev
            void removedTaskId
            return rest
        })
    }, [])

    const sendTaskNotification = useCallback((taskId: string, title: string) => {
        if (permission !== "granted") return

        try {
            const n = new Notification(t("tasks.notificationTitle"), {
                body: t("tasks.notificationBody", { title }),
                icon: "/favicon.ico", // Using default favicon or a specific icon if available
                tag: `task-${taskId}`, // Prevent duplicate notifications
            })

            n.onclick = () => {
                window.focus()
                n.close()
            }

            // Unsubscribe after notifying
            unsubscribeFromTask(taskId)
        } catch (err) {
            console.error("Notification error:", err)
        }
    }, [permission, t, unsubscribeFromTask])

    return {
        permission,
        requestPermission,
        subscribeToTask,
        unsubscribeFromTask,
        isSubscribed: (taskId: string) => taskId in subscriptions,
        sendTaskNotification,
        subbedTaskIds // Exporting for the listener
    }
}
