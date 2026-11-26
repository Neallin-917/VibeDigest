import type { RealtimeChannel, RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase'

type TaskRow = Record<string, unknown>
type TaskListener = (task: TaskRow) => void
export type TaskReadCheck = 'failed' | 'rechecking' | undefined

type TaskEntry = {
  channel: RealtimeChannel
  listeners: Map<number, { onRow: TaskListener; onCheck?: (check: TaskReadCheck) => void }>
  readCheck: TaskReadCheck
  snapshot: TaskRow | null
  pendingRead: { promise: Promise<number>; finish: (result: number | Promise<number>) => void } | null
}

const taskEntries = new Map<string, TaskEntry>()
let nextListenerId = 0

function isTaskRow(value: unknown): value is TaskRow {
  return typeof value === 'object' && value !== null
}

function publishTask(entry: TaskEntry, row: TaskRow) {
  const previousTime = Date.parse(String(entry.snapshot?.updated_at ?? ''))
  const nextTime = Date.parse(String(row.updated_at ?? ''))
  if (Number.isFinite(previousTime) && Number.isFinite(nextTime) && nextTime < previousTime) return
  entry.snapshot = row
  updateReadCheck(entry, undefined)
  entry.listeners.forEach(({ onRow }) => onRow(row))
}

export function transientReadFailure(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500
}

function updateReadCheck(entry: TaskEntry, check: TaskReadCheck) {
  if (entry.readCheck === check) return
  entry.readCheck = check
  entry.listeners.forEach(({ onCheck }) => onCheck?.(check))
}

async function readTaskRow(taskId: string) {
  try {
    return await createClient().from('tasks').select('*').eq('id', taskId).single()
  } catch {
    return { data: null, status: 0 }
  }
}

async function primeTask(taskId: string, entry: TaskEntry, afterConnect = false) {
  const previous = entry.pendingRead
  if (!afterConnect && previous) return previous.promise
  if (!afterConnect && entry.snapshot) return 200
  if (entry.readCheck === 'failed') updateReadCheck(entry, 'rechecking')

  let finish!: (result: number | Promise<number>) => void
  const promise = new Promise<number>(resolve => { finish = resolve })
  const read = { promise, finish }
  entry.pendingRead = read
  // A read started before the channel connected can miss a committed change.
  // Move its callers onto the new read even if the older request is stalled.
  previous?.finish(promise)
  void readTaskRow(taskId).then(({ data, status }) => {
    if (entry.pendingRead !== read) return
    entry.pendingRead = null
    if (isTaskRow(data)) {
      publishTask(entry, data)
      finish(200)
    } else {
      if (!entry.snapshot) updateReadCheck(entry, transientReadFailure(status) ? 'failed' : undefined)
      finish(status === 200 ? 404 : status)
    }
  })
  return promise
}

function createTaskEntry(taskId: string): TaskEntry {
  const supabase = createClient()
  const entry: TaskEntry = {
    channel: supabase
      .channel(`shared_task_${taskId}`, { config: { postgres_changes_options: { wait: true } } })
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
      ),
    listeners: new Map(),
    readCheck: undefined,
    snapshot: null,
    pendingRead: null,
  }

  let connected = false
  entry.channel.subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
    if (status !== 'SUBSCRIBED') {
      connected = false
      return
    }
    if (connected || entry.listeners.size === 0) return
    connected = true
    void primeTask(taskId, entry, true)
  })

  return entry
}

export function readSubscribedTask(taskId: string) {
  const entry = taskEntries.get(taskId)
  return entry ? primeTask(taskId, entry) : Promise.resolve(404)
}

export function subscribeToTask(taskId: string, listener: TaskListener, onCheck?: (check: TaskReadCheck) => void) {
  let entry = taskEntries.get(taskId)
  if (!entry) {
    entry = createTaskEntry(taskId)
    taskEntries.set(taskId, entry)
  }

  const listenerId = nextListenerId++
  entry.listeners.set(listenerId, { onRow: listener, onCheck })
  onCheck?.(entry.readCheck)

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
    currentEntry.pendingRead?.finish(404)
    currentEntry.pendingRead = null
    void createClient().removeChannel(currentEntry.channel)
  }
}
