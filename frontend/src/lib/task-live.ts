import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase'

type TaskRow = Record<string, unknown>
type TaskListener = (task: TaskRow) => void

type TaskEntry = {
  channel: RealtimeChannel
  listeners: Map<number, TaskListener>
  snapshot: TaskRow | null
  primePromise: Promise<void> | null
}

const taskEntries = new Map<string, TaskEntry>()
let nextListenerId = 0

function isTaskRow(value: unknown): value is TaskRow {
  return typeof value === 'object' && value !== null
}

function publishTask(entry: TaskEntry, row: TaskRow) {
  entry.snapshot = row
  entry.listeners.forEach((listener) => listener(row))
}

async function primeTask(taskId: string, entry: TaskEntry) {
  if (entry.snapshot || entry.primePromise) return

  const supabase = createClient()
  entry.primePromise = (async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (isTaskRow(data)) {
      publishTask(entry, data)
    }
  })().finally(() => {
    entry.primePromise = null
  })

  await entry.primePromise
}

function createTaskEntry(taskId: string): TaskEntry {
  const supabase = createClient()
  const entry: TaskEntry = {
    channel: supabase
      .channel(`shared_task_${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (isTaskRow(payload.new)) {
            publishTask(entry, payload.new)
          }
        }
      )
      .subscribe(),
    listeners: new Map<number, TaskListener>(),
    snapshot: null,
    primePromise: null,
  }

  return entry
}

export function subscribeToTask(taskId: string, listener: TaskListener) {
  let entry = taskEntries.get(taskId)
  if (!entry) {
    entry = createTaskEntry(taskId)
    taskEntries.set(taskId, entry)
  }

  const listenerId = nextListenerId++
  entry.listeners.set(listenerId, listener)

  if (entry.snapshot) {
    listener(entry.snapshot)
  } else {
    void primeTask(taskId, entry)
  }

  return () => {
    const currentEntry = taskEntries.get(taskId)
    if (!currentEntry) return

    currentEntry.listeners.delete(listenerId)
    if (currentEntry.listeners.size > 0) return

    taskEntries.delete(taskId)
    void createClient().removeChannel(currentEntry.channel)
  }
}
