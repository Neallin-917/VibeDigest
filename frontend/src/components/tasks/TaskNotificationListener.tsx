"use client"

import { useEffect, useRef } from "react"
import { useTaskNotification } from "@/hooks/useTaskNotification"
import { subscribeToTask } from "@/lib/task-live"

type Task = {
    id: string
    video_title: string
    video_url: string
    status: string
}

export function TaskNotificationListener() {
    // We only need the subscription list and the sender function
    // The permission check is handled inside sendTaskNotification
    const { subbedTaskIds, sendTaskNotification } = useTaskNotification()
    const taskStatusesRef = useRef<Map<string, string>>(new Map())

    useEffect(() => {
        const ids = Array.from(subbedTaskIds)
        if (ids.length === 0) return

        const unsubscribers = ids.map((id) =>
            subscribeToTask(id, (row) => {
                const newTask = row as unknown as Task
                const previousStatus = taskStatusesRef.current.get(newTask.id)
                taskStatusesRef.current.set(newTask.id, newTask.status)

                if (previousStatus && previousStatus !== 'completed' && newTask.status === 'completed') {
                    sendTaskNotification(newTask.id, newTask.video_title || newTask.video_url)
                }
            })
        )

        return () => {
            ids.forEach((id) => {
                taskStatusesRef.current.delete(id)
            })
            unsubscribers.forEach((unsubscribe) => unsubscribe())
        }
    }, [subbedTaskIds, sendTaskNotification])

    return null // This component renders nothing
}
