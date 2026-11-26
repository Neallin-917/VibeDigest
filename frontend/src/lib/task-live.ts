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
  primePromise: Promise<number> | null
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

async function primeTask(taskId: string, entry: TaskEntry, force = false) {
  if (!force && entry.snapshot) return 200
  if (entry.primePromise) return entry.primePromise

  if (entry.readCheck === 'failed') updateReadCheck(entry, 'rechecking')
  const supabase = createClient()
  entry.primePromise = (async () => {
    const { data, status } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (isTaskRow(data)) {
      publishTask(entry, data)
      return 200
    }
    return status === 200 ? 404 : status
  })().catch(() => {
    // A transport failure leaves the last committed snapshot in place.
    return 0
  }).then(status => {
    if (!entry.snapshot) {
      updateReadCheck(entry, transientReadFailure(status) ? 'failed' : undefined)
    }
    return status
  }).finally(() => {
    entry.primePromise = null
  })

  return entry.primePromise
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
      ),
    listeners: new Map(),
    readCheck: undefined,
    snapshot: null,
    primePromise: null,
  }

  entry.channel.subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
    if (status === 'SUBSCRIBED') void primeTask(taskId, entry, true)
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
    void createClient().removeChannel(currentEntry.channel)
  }
}
