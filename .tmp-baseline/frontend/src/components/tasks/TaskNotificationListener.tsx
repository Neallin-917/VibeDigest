"use client"

import { useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { useTaskNotification } from "@/hooks/useTaskNotification"
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

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
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        const ids = Array.from(subbedTaskIds)
        if (ids.length === 0) return

        const channels = ids.map(id => {
            return supabase.channel(`notification_task_${id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tasks',
                    filter: `id=eq.${id}`
                }, (payload: RealtimePostgresChangesPayload<Task>) => {
                    const newTask = payload.new as Task
                    if (newTask.status === 'completed') {
                        sendTaskNotification(newTask.id, newTask.video_title || newTask.video_url)
                    }
                })
                .subscribe()
        })

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch))
        }
    }, [subbedTaskIds, supabase, sendTaskNotification])

    return null // This component renders nothing
}
