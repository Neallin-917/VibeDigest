'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeSystemPayload } from '@supabase/supabase-js'

import { sanitizeStoredMessages } from '@/lib/chat-message-boundary'
import type { ChatUIMessage, StoredChatMessageRow } from '@/lib/chat-ui'
import { createClient } from '@/lib/supabase'

type SetMessages = (messages: ChatUIMessage[] | ((current: ChatUIMessage[]) => ChatUIMessage[])) => void

type ChatRealtimeOptions = {
  threadId: string
  enabled: boolean
  status: string
  messages: ChatUIMessage[]
  initialMessages: ChatUIMessage[]
  setMessages: SetMessages
}

function createdAt(message: ChatUIMessage): number | undefined {
  const value = message.metadata?.createdAt
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/** Merge persisted changes without deleting optimistic messages absent from a snapshot. */
export function mergeChatMessages(
  current: ChatUIMessage[],
  incoming: ChatUIMessage[],
  preferCurrent = false,
): ChatUIMessage[] {
  const byId = new Map(current.map(message => [message.id, message]))
  for (const message of incoming) {
    const previous = byId.get(message.id)
    if (previous === message) continue
    byId.set(message.id, previous ? {
      ...(preferCurrent ? message : previous),
      ...(preferCurrent ? previous : message),
      ...(previous.metadata || message.metadata ? {
        metadata: preferCurrent
          ? { ...message.metadata, ...previous.metadata }
          : { ...previous.metadata, ...message.metadata },
      } : {}),
    } : message)
  }

  const merged = [...byId.values()]
  // Undated messages retain their slots; only dated messages are reordered.
  // This gives deterministic chronology without inventing optimistic timestamps.
  const dated = merged.filter(message => createdAt(message) !== undefined)
    .sort((left, right) => createdAt(left)! - createdAt(right)!)
  let datedIndex = 0
  const ordered = merged.map(message => createdAt(message) === undefined ? message : dated[datedIndex++])

  return current.length === ordered.length && current.every((message, index) => (
    message === ordered[index] || JSON.stringify(message) === JSON.stringify(ordered[index])
  )) ? current : ordered
}

function isBusy(status: string) {
  return status === 'streaming' || status === 'submitted'
}

function storedMessages(rows: unknown[]): ChatUIMessage[] {
  const records = rows.filter((row): row is Record<string, unknown> => (
    typeof row === 'object' && row !== null && !Array.isArray(row)
  ))
  const normalized: StoredChatMessageRow[] = records.map(row => ({
    id: typeof row.id === 'string' ? row.id : '',
    role: row.role,
    content: row.content,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    metadata: row.metadata,
  }))
  return sanitizeStoredMessages(normalized).validMessages
}

export function useChatRealtime({
  threadId, enabled, status, messages, initialMessages, setMessages,
}: ChatRealtimeOptions) {
  const state = useRef({ threadId, status, messages, setMessages })
  const pending = useRef({ threadId, initial: [] as ChatUIMessage[], database: [] as ChatUIMessage[] })

  const applyMessages = useCallback((incoming: ChatUIMessage[], preferCurrent = false) => {
    if (!incoming.length) return
    const next = mergeChatMessages(state.current.messages, incoming, preferCurrent)
    if (next === state.current.messages) return
    state.current.messages = next
    state.current.setMessages(current => mergeChatMessages(current, incoming, preferCurrent))
  }, [])

  useEffect(() => {
    state.current = { threadId, status, messages, setMessages }
    if (pending.current.threadId !== threadId) {
      pending.current = { threadId, initial: [], database: [] }
    }
    if (!isBusy(status)) {
      const buffered = pending.current
      pending.current = { threadId, initial: [], database: [] }
      // Props captured during a stream may predate its final answer. They may
      // add missing history, but must not replace that answer with stale content.
      applyMessages(buffered.initial, true)
      applyMessages(buffered.database)
    }
  }, [threadId, status, messages, setMessages, applyMessages])

  useEffect(() => {
    if (isBusy(state.current.status)) {
      pending.current.initial = mergeChatMessages(pending.current.initial, initialMessages)
    } else {
      applyMessages(initialMessages)
    }
  }, [threadId, initialMessages, applyMessages])

  useEffect(() => {
    if (!enabled) return
    const supabase = createClient()
    let disposed = false
    let subscribed = false
    let snapshotVersion = 0
    let eventVersion = 0
    const liveVersions = new Map<string, number>()

    const receive = (incoming: ChatUIMessage[]) => {
      if (disposed || state.current.threadId !== threadId) return
      if (isBusy(state.current.status)) {
        pending.current.database = mergeChatMessages(pending.current.database, incoming)
      } else {
        applyMessages(incoming)
      }
    }

    const readSnapshot = async () => {
      const version = ++snapshotVersion
      const eventsAtStart = eventVersion
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at, metadata')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true })
        if (disposed || version !== snapshotVersion || error || !data) return
        // An UPDATE arriving while the snapshot was in flight is newer than
        // that snapshot for its ID, regardless of network response order.
        receive(storedMessages(data).filter(message => (
          (liveVersions.get(message.id) ?? 0) <= eventsAtStart
        )))
      } catch {
        // Keep local messages. A later subscription/ready event retries the snapshot.
      }
    }

    const onChange = (payload: { new: Record<string, unknown> }) => {
      if (disposed || payload.new.thread_id !== threadId) return
      const incoming = storedMessages([payload.new])
      for (const message of incoming) liveVersions.set(message.id, ++eventVersion)
      receive(incoming)
    }

    const channel = supabase.channel(`chat-messages:${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}`,
      }, onChange)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}`,
      }, onChange)
      .on('system', {}, (payload: RealtimeSystemPayload) => {
        // SUBSCRIBED can precede the database listener. Re-read once it is ready
        // to recover writes missed in that gap, using the same stale-event guards.
        if (!disposed && payload?.extension === 'postgres_changes' && payload.status === 'ok') {
          void readSnapshot()
        }
      })
      .subscribe((channelStatus: string) => {
        if (channelStatus === 'SUBSCRIBED') {
          if (!subscribed) void readSnapshot()
          subscribed = true
        } else {
          subscribed = false
        }
      })

    return () => {
      disposed = true
      snapshotVersion++
      void supabase.removeChannel(channel)
    }
  }, [enabled, threadId, applyMessages])
}
