import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatUIMessage } from '@/lib/chat-ui'
import { mergeChatMessages, useChatRealtime } from './useChatRealtime'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createClient: createClientMock }))

type Change = { new: Record<string, unknown> }
type SystemEvent = { extension: string; status: string }
type Channel = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  changes: Map<string, (payload: Change) => void>
  system: (payload: SystemEvent) => void
  status: (value: string) => void
}

let channels: Channel[]
let snapshot: ReturnType<typeof vi.fn>
let from: ReturnType<typeof vi.fn>
let removeChannel: ReturnType<typeof vi.fn>
let eq: ReturnType<typeof vi.fn>

const EMPTY: ChatUIMessage[] = []

function message(id: string, text = id, at?: string | Date): ChatUIMessage {
  return {
    id, role: 'assistant', parts: [{ type: 'text', text }],
    ...(at ? { metadata: { createdAt: at } } : {}),
  }
}

function row(id: string, text = id, at = '2026-08-28T01:00:00Z', threadId = 'thread-1') {
  return {
    id, role: 'assistant', content: [{ type: 'text', text }],
    created_at: at, thread_id: threadId, metadata: { agentState: 'completed' },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

function setup({
  messages = EMPTY,
  ...overrides
}: Partial<Parameters<typeof useChatRealtime>[0]> = {}) {
  let current = messages
  let props = {
    threadId: 'thread-1', enabled: true, status: 'ready', initialMessages: EMPTY,
    ...overrides,
  }
  const setMessages = vi.fn((updater: ChatUIMessage[] | ((previous: ChatUIMessage[]) => ChatUIMessage[])) => {
    current = typeof updater === 'function' ? updater(current) : updater
  })
  const hook = renderHook(options => useChatRealtime({ ...options, messages: current, setMessages }), {
    initialProps: props,
  })
  return {
    setMessages,
    messages: () => current,
    rerender: (next: Partial<typeof props>, streamedMessages?: ChatUIMessage[]) => {
      if (streamedMessages) current = streamedMessages
      props = { ...props, ...next }
      hook.rerender(props)
    },
    unmount: hook.unmount,
  }
}

async function subscribed(channel = channels[channels.length - 1]) {
  await act(async () => { channel.status('SUBSCRIBED') })
}

async function systemEvent(payload: SystemEvent, channel = channels[channels.length - 1]) {
  await act(async () => { channel.system(payload) })
}

function changed(event: 'INSERT' | 'UPDATE', value: Record<string, unknown>, channel = channels[channels.length - 1]) {
  act(() => { channel.changes.get(event)?.({ new: value }) })
}

beforeEach(() => {
  channels = []
  snapshot = vi.fn().mockResolvedValue({ data: [], error: null })
  const query = { select: vi.fn(), eq: vi.fn(), order: snapshot }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  eq = query.eq
  from = vi.fn().mockReturnValue(query)
  removeChannel = vi.fn().mockResolvedValue('ok')
  const channel = vi.fn(() => {
    const next: Channel = {
      on: vi.fn(), subscribe: vi.fn(), changes: new Map(),
      system: () => undefined, status: () => undefined,
    }
    next.on.mockImplementation((kind, filter, callback) => {
      if (kind === 'system') next.system = callback
      else next.changes.set(filter.event, callback)
      return next
    })
    next.subscribe.mockImplementation(callback => {
      next.status = callback
      return next
    })
    channels.push(next)
    return next
  })
  createClientMock.mockReset().mockReturnValue({ from, channel, removeChannel })
})

describe('mergeChatMessages', () => {
  it('preserves optimistic messages absent from snapshots and deduplicates IDs', () => {
    const optimistic = message('optimistic')
    const merged = mergeChatMessages([message('stored'), optimistic], [message('stored'), message('new')])
    expect(merged.map(({ id }) => id)).toEqual(['stored', 'optimistic', 'new'])
    expect(merged[1]).toBe(optimistic)
  })

  it('applies updated content and metadata for existing IDs', () => {
    const original = { ...message('answer', 'Old answer'), metadata: { model: 'fixture-model', agentState: 'running' as const } }
    const update = { ...message('answer', 'Final answer'), metadata: { totalTokens: 12, agentState: 'completed' as const } }
    expect(mergeChatMessages([original], [update])).toEqual([{
      ...update,
      metadata: { model: 'fixture-model', agentState: 'completed', totalTokens: 12 },
    }])
  })

  it('orders dated messages chronologically and preserves stable positions for ties and undated entries', () => {
    const earlier = message('earlier', 'Earlier', '2026-08-28T01:00:00Z')
    const later = message('later', 'Later', new Date('2026-08-28T02:00:00Z'))
    const sameTime = message('same-time', 'Same time', '2026-08-28T02:00:00Z')
    const unknown = message('undated')
    const invalidDate = message('invalid-date', 'Invalid', 'not-a-date')
    expect(mergeChatMessages([later, unknown, earlier], [sameTime, invalidDate]).map(({ id }) => id))
      .toEqual(['earlier', 'undated', 'later', 'same-time', 'invalid-date'])
  })

  it('keeps the same array for a duplicate snapshot without unnecessary UI writes', () => {
    const current = [message('answer', 'Same', '2026-08-28T01:00:00Z')]
    expect(mergeChatMessages(current, [{ ...current[0] }])).toBe(current)
    const undated = [message('undated')]
    expect(mergeChatMessages(undated, [{ ...undated[0] }])).toBe(undated)
  })

  it('allows stale initial history to fill gaps without replacing a newer streamed answer', () => {
    const current = message('answer', 'Completed answer')
    expect(mergeChatMessages([current], [message('answer', 'Stale partial'), message('history')], true))
      .toEqual([current, message('history')])
  })
})

describe('useChatRealtime', () => {
  it('subscribes to INSERT and UPDATE for only the current thread and reads one snapshot after SUBSCRIBED', async () => {
    setup()
    expect(channels).toHaveLength(1)
    expect(channels[0].on.mock.calls.map(([kind, filter]) => [kind, filter])).toEqual([
      ['postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'thread_id=eq.thread-1' }],
      ['postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: 'thread_id=eq.thread-1' }],
      ['system', {}],
    ])
    expect(from).not.toHaveBeenCalled()
    await subscribed()
    await subscribed()
    expect(from).toHaveBeenCalledExactlyOnceWith('chat_messages')
    expect(eq).toHaveBeenCalledWith('thread_id', 'thread-1')
    expect(snapshot).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('recovers messages written after the initial snapshot but before Postgres Changes becomes ready', async () => {
    snapshot.mockResolvedValueOnce({
      data: [{ ...row('reply', 'Processing'), metadata: { agentState: 'waiting_task' } }],
      error: null,
    })
    const hook = setup({ messages: [message('optimistic')] })
    await subscribed()
    expect(hook.messages().map(({ id }) => id)).toEqual(['optimistic', 'reply'])

    // The database changed in the SUBSCRIBED -> listener-ready gap. No event
    // was delivered, so only the post-ready snapshot can discover these rows.
    snapshot.mockResolvedValueOnce({
      data: [row('reply', 'Completed'), row('completion', 'Grounded answer')], error: null,
    })
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    expect(snapshot).toHaveBeenCalledTimes(2)
    expect(hook.messages().map(({ id }) => id)).toEqual(['optimistic', 'reply', 'completion'])
    expect(hook.messages()[1]).toMatchObject({
      parts: [{ type: 'text', text: 'Completed' }], metadata: { agentState: 'completed' },
    })
  })

  it.each([
    { extension: 'postgres_changes', status: 'error' },
    { extension: 'postgres_changes', status: 'pending' },
    { extension: 'system', status: 'ok' },
    { extension: 'broadcast', status: 'ok' },
  ])('ignores system events that do not confirm Postgres Changes readiness: %j', async payload => {
    const hook = setup({ messages: [message('optimistic')] })
    await subscribed()
    await systemEvent(payload)
    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(hook.setMessages).not.toHaveBeenCalled()
    expect(hook.messages()).toEqual([message('optimistic')])
  })

  it('reads another post-ready snapshot on reconnect to recover the new listener gap', async () => {
    const hook = setup()
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('one')], error: null })
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    act(() => channels[0].status('CHANNEL_ERROR'))
    snapshot.mockResolvedValueOnce({ data: [row('one')], error: null })
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('one'), row('two')], error: null })
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    expect(snapshot).toHaveBeenCalledTimes(4)
    expect(hook.messages().map(({ id }) => id)).toEqual(['one', 'two'])
  })

  it.each(['streaming', 'submitted'])('buffers the post-ready snapshot while %s', async status => {
    const liveAnswer = message('stream', 'Generating answer')
    const hook = setup({ messages: [liveAnswer], status })
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('completion', 'Background answer')], error: null })
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    expect(snapshot).toHaveBeenCalledTimes(2)
    expect(hook.setMessages).not.toHaveBeenCalled()
    expect(hook.messages()).toEqual([liveAnswer])

    hook.rerender({ status: 'ready' }, [message('stream', 'Final streamed answer')])
    expect(hook.messages().map(({ id }) => id)).toEqual(['stream', 'completion'])
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Final streamed answer' }])
    expect(hook.setMessages).toHaveBeenCalledOnce()
  })

  it('keeps newer realtime updates when the post-ready snapshot resolves later', async () => {
    const response = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    const hook = setup()
    await subscribed()
    snapshot.mockReturnValueOnce(response.promise)
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    changed('UPDATE', row('answer', 'Latest realtime content'))
    await act(async () => response.resolve({ data: [row('answer', 'Stale ready snapshot'), row('missed')], error: null }))
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Latest realtime content' }])
    expect(hook.messages().map(({ id }) => id)).toEqual(['answer', 'missed'])
  })

  it('ignores a delayed initial snapshot after the newer post-ready snapshot', async () => {
    const initial = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    snapshot.mockReturnValueOnce(initial.promise)
    const hook = setup()
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('answer', 'Ready snapshot answer')], error: null })
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    await act(async () => initial.resolve({ data: [row('answer', 'Stale initial answer')], error: null }))
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Ready snapshot answer' }])
  })

  it('recovers a failed initial snapshot on the ready event without waiting for reconnection', async () => {
    snapshot.mockRejectedValueOnce(new Error('Initial snapshot failed'))
    const hook = setup()
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('recovered')], error: null })
    await systemEvent({ extension: 'postgres_changes', status: 'error' })
    expect(snapshot).toHaveBeenCalledTimes(1)
    await systemEvent({ extension: 'postgres_changes', status: 'ok' })
    expect(snapshot).toHaveBeenCalledTimes(2)
    expect(hook.messages().map(({ id }) => id)).toEqual(['recovered'])
  })

  it('does not open a database subscription before authentication is ready', () => {
    const hook = setup({ enabled: false })
    expect(createClientMock).not.toHaveBeenCalled()
    hook.rerender({ enabled: true })
    expect(channels).toHaveLength(1)
  })

  it('merges idle INSERT/UPDATE events and ignores duplicate updates', () => {
    const hook = setup({ messages: [message('optimistic')] })
    changed('INSERT', row('answer', 'First version'))
    changed('UPDATE', row('answer', 'Latest version'))
    expect(hook.messages().map(({ id }) => id)).toEqual(['optimistic', 'answer'])
    expect(hook.messages()[1]).toMatchObject({
      parts: [{ type: 'text', text: 'Latest version' }],
      metadata: { agentState: 'completed', createdAt: '2026-08-28T01:00:00Z' },
    })
    expect(hook.setMessages).toHaveBeenCalledTimes(2)
    changed('UPDATE', row('answer', 'Latest version'))
    expect(hook.setMessages).toHaveBeenCalledTimes(2)
  })

  it('recovers missing messages once after a reconnect without dropping optimistic messages', async () => {
    snapshot.mockResolvedValueOnce({ data: [row('one')], error: null })
    const hook = setup({ messages: [message('optimistic')] })
    await subscribed()
    snapshot.mockResolvedValueOnce({ data: [row('one'), row('two')], error: null })
    act(() => channels[0].status('CHANNEL_ERROR'))
    await subscribed()
    await subscribed()
    expect(snapshot).toHaveBeenCalledTimes(2)
    expect(hook.messages().map(({ id }) => id)).toEqual(['optimistic', 'one', 'two'])
  })

  it.each(['streaming', 'submitted'])('buffers all database updates while %s and merges their latest versions after idle', async status => {
    const liveAnswer = message('stream', 'Generating answer')
    const hook = setup({ messages: [message('optimistic'), liveAnswer], status })
    snapshot.mockResolvedValueOnce({ data: [row('snapshot')], error: null })
    await subscribed()
    changed('INSERT', row('background', 'Initial background result'))
    changed('UPDATE', row('background', 'Final background result'))
    expect(hook.setMessages).not.toHaveBeenCalled()
    expect(hook.messages()).toEqual([message('optimistic'), liveAnswer])

    hook.rerender({ status: 'ready' }, [message('optimistic'), message('stream', 'Final streamed answer')])
    expect(hook.messages().map(({ id }) => id)).toEqual(['optimistic', 'stream', 'snapshot', 'background'])
    expect(hook.messages()[1].parts).toEqual([{ type: 'text', text: 'Final streamed answer' }])
    expect(hook.messages()[3].parts).toEqual([{ type: 'text', text: 'Final background result' }])
    expect(hook.setMessages).toHaveBeenCalledOnce()
  })

  it('merges idle initial-message changes instead of replacing optimistic messages', () => {
    const hook = setup({ messages: [message('answer', 'Old'), message('optimistic')] })
    hook.rerender({ initialMessages: [message('answer', 'Updated'), message('history')] })
    expect(hook.messages().map(({ id }) => id)).toEqual(['answer', 'optimistic', 'history'])
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Updated' }])
  })

  it('buffers stale initial props during streaming without replacing the final streamed content', () => {
    const hook = setup({ messages: [message('answer', 'Streaming')], status: 'streaming' })
    hook.rerender({ initialMessages: [message('answer', 'Older stored text'), message('history')] })
    expect(hook.setMessages).not.toHaveBeenCalled()
    hook.rerender({ status: 'ready' }, [message('answer', 'Final streamed content')])
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Final streamed content' }])
    expect(hook.messages().map(({ id }) => id)).toEqual(['answer', 'history'])
  })

  it('does not let an in-flight snapshot replace a more recent realtime update', async () => {
    const response = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    snapshot.mockReturnValueOnce(response.promise)
    const hook = setup()
    await subscribed()
    changed('UPDATE', row('answer', 'Latest realtime content'))
    await act(async () => response.resolve({ data: [row('answer', 'Old snapshot'), row('other')], error: null }))
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Latest realtime content' }])
    expect(hook.messages().map(({ id }) => id)).toEqual(['answer', 'other'])
  })

  it('ignores an earlier snapshot response after a newer reconnect snapshot', async () => {
    const oldSnapshot = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    snapshot.mockReturnValueOnce(oldSnapshot.promise)
    const hook = setup()
    await subscribed()
    act(() => channels[0].status('TIMED_OUT'))
    snapshot.mockResolvedValueOnce({ data: [row('answer', 'Reconnect answer')], error: null })
    await subscribed()
    await act(async () => oldSnapshot.resolve({ data: [row('answer', 'Old answer')], error: null }))
    expect(hook.messages()[0].parts).toEqual([{ type: 'text', text: 'Reconnect answer' }])
  })

  it('drops invalid stored messages and cross-thread events', async () => {
    snapshot.mockResolvedValueOnce({ data: [null, { ...row('system'), role: 'system' }, row('valid')], error: null })
    const hook = setup()
    await subscribed()
    changed('INSERT', row('other-thread', 'Private', undefined, 'thread-2'))
    changed('INSERT', { ...row('empty'), content: [] })
    expect(hook.messages().map(({ id }) => id)).toEqual(['valid'])
  })

  it('leaves local history intact on a snapshot failure and retries when reconnected', async () => {
    snapshot.mockRejectedValueOnce(new Error('Network unavailable'))
    const hook = setup({ messages: [message('optimistic')] })
    await subscribed()
    expect(hook.messages()).toEqual([message('optimistic')])
    expect(hook.setMessages).not.toHaveBeenCalled()
    expect(snapshot).toHaveBeenCalledTimes(1)
    act(() => channels[0].status('CLOSED'))
    await subscribed()
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it('clears old-thread buffers and ignores late callbacks when the active thread changes', async () => {
    const oldSnapshot = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    snapshot.mockReturnValueOnce(oldSnapshot.promise)
    const hook = setup({ status: 'streaming' })
    const oldChannel = channels[0]
    await subscribed(oldChannel)
    changed('INSERT', row('buffered-old'), oldChannel)
    hook.rerender({ threadId: 'thread-2', status: 'ready' }, [])
    await systemEvent({ extension: 'postgres_changes', status: 'ok' }, oldChannel)
    expect(snapshot).toHaveBeenCalledTimes(1)
    changed('UPDATE', row('late-old'), oldChannel)
    await act(async () => oldSnapshot.resolve({ data: [row('snapshot-old')], error: null }))
    expect(hook.messages()).toEqual([])
    expect(removeChannel).toHaveBeenCalledWith(oldChannel)
    expect(channels).toHaveLength(2)
    changed('INSERT', row('new', 'New thread', undefined, 'thread-2'))
    expect(hook.messages().map(({ id }) => id)).toEqual(['new'])
  })

  it('removes its channel and ignores pending snapshot results on unmount', async () => {
    const response = deferred<{ data: ReturnType<typeof row>[]; error: null }>()
    snapshot.mockReturnValueOnce(response.promise)
    const hook = setup()
    const channel = channels[0]
    await subscribed()
    hook.unmount()
    await systemEvent({ extension: 'postgres_changes', status: 'ok' }, channel)
    expect(snapshot).toHaveBeenCalledTimes(1)
    await act(async () => response.resolve({ data: [row('late')], error: null }))
    expect(removeChannel).toHaveBeenCalledWith(channel)
    expect(hook.setMessages).not.toHaveBeenCalled()
  })
})
