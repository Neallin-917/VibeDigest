'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

/** Re-render the server projection after committed task or summary changes. */
export function TaskDetailRefresh({ taskId }: { taskId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let disposed = false
    let pending: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      if (disposed) return
      clearTimeout(pending)
      // A completion writes task + output together; fetch the projection once.
      pending = setTimeout(() => {
        if (!disposed) router.refresh()
      }, 120)
    }
    const channel = supabase.channel(`task_detail_${taskId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}`,
      }, refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'task_outputs', filter: `task_id=eq.${taskId}`,
      }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (payload.eventType === 'DELETE' || ('kind' in payload.new && payload.new.kind === 'summary')) refresh()
      })
      .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
        // Also catch commits between the server read and subscription, and on reconnect.
        if (status === 'SUBSCRIBED') refresh()
      })

    return () => {
      disposed = true
      clearTimeout(pending)
      void supabase.removeChannel(channel)
    }
  }, [router, taskId])

  return null
}
