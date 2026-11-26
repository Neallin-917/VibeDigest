import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const live = vi.hoisted(() => ({ single: vi.fn(), removeChannel: vi.fn(), channel: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({
  channel: live.channel,
  removeChannel: live.removeChannel,
  from: () => ({ select: () => ({ eq: () => ({ single: live.single }) }) }),
}) }))
import { readSubscribedTask, subscribeToTask } from './task-live'

describe('shared task subscription', () => {
  let onRow: (payload: { new: Record<string, unknown> }) => void
  let onStatus: (status: string) => void
  const cleanups: (() => void)[] = []
  beforeEach(() => {
    vi.clearAllMocks()
    live.single.mockResolvedValue({ data: { id: 'task-1', status: 'failed', updated_at: '2026-09-07T01:00:00Z' } })
    live.channel.mockImplementation(() => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: typeof onRow) => { onRow = callback; return channel },
        subscribe: (callback: typeof onStatus) => { onStatus = callback; return channel },
      }
      return channel
    })
  })
  afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()) })

  it('shares one channel and catches a newer failure after reconnect', async () => {
    const listener = vi.fn()
    cleanups.push(subscribeToTask('task-1', listener), subscribeToTask('task-1', vi.fn()))
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    expect(live.channel).toHaveBeenCalledOnce()
    live.single.mockResolvedValue({ data: { id: 'task-1', status: 'failed', updated_at: '2026-09-07T02:00:00Z' } })
    onStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    expect(listener.mock.lastCall?.[0].updated_at).toBe('2026-09-07T02:00:00Z')
    cleanups.shift()!()
    expect(live.removeChannel).not.toHaveBeenCalled()
    cleanups.shift()!()
    expect(live.removeChannel).toHaveBeenCalledOnce()
  })

  it('coalesces manual checks with the pending prime and reads again after a failure', async () => {
    let resolve!: (value: unknown) => void
    live.single.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const listener = vi.fn()
    cleanups.push(subscribeToTask('task-1', listener))
    const first = readSubscribedTask('task-1')
    const second = readSubscribedTask('task-1')
    resolve({ data: null, status: 503 })
    expect(await Promise.all([first, second])).toEqual([503, 503])
    expect(live.single).toHaveBeenCalledOnce()
    live.single.mockResolvedValueOnce({ data: null, status: 200 })
    expect(await readSubscribedTask('task-1')).toBe(404)
    expect(await readSubscribedTask('task-1')).toBe(200)
    expect(await readSubscribedTask('task-1')).toBe(200)
    expect(live.single).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenCalledOnce()
    expect(await readSubscribedTask('not-subscribed')).toBe(404)
  })

  it('shares a failed first read and clears the recovery state on denial or a later realtime row', async () => {
    const first = vi.fn()
    const second = vi.fn()
    live.single.mockResolvedValueOnce({ data: null, status: 503 })
    cleanups.push(subscribeToTask('task-1', vi.fn(), first))
    await vi.waitFor(() => expect(first).toHaveBeenLastCalledWith('failed'))
    live.single.mockResolvedValueOnce({ data: null, status: 403 })
    cleanups.push(subscribeToTask('task-1', vi.fn(), second))
    expect(second.mock.calls.slice(0, 2)).toEqual([['failed'], ['rechecking']])
    await vi.waitFor(() => expect(first).toHaveBeenLastCalledWith(undefined))
    expect(second).toHaveBeenLastCalledWith(undefined)
    onRow({ new: { id: 'task-1', status: 'completed' } })
    live.single.mockResolvedValueOnce({ data: null, status: 503 })
    onStatus('SUBSCRIBED')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(second).toHaveBeenLastCalledWith(undefined)
    expect(live.single).toHaveBeenCalledTimes(3)
  })

  it('confirms a provisional row on demand, shares the pending read, and reuses its result', async () => {
    const row = { id: 'task-1', status: 'completed' }
    live.single.mockResolvedValueOnce({ data: row })
    const listener = vi.fn()
    const check = vi.fn()
    cleanups.push(subscribeToTask(row.id, listener, check))
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(row, false))
    live.single.mockResolvedValueOnce({ data: null, status: 503 })
    expect(await readSubscribedTask(row.id, 'en')).toBe(503)
    expect(check).toHaveBeenLastCalledWith('failed')
    live.single.mockResolvedValueOnce({ data: null, status: 403 })
    expect(await readSubscribedTask(row.id, 'en')).toBe(403)
    expect(check).toHaveBeenLastCalledWith('unavailable')
    live.single.mockResolvedValueOnce({ data: row })
    const first = readSubscribedTask(row.id, 'en')
    const second = readSubscribedTask(row.id, 'en')
    expect(await Promise.all([first, second])).toEqual([200, 200])
    expect(listener).toHaveBeenLastCalledWith(row, 'en')
    expect(await readSubscribedTask(row.id, 'en')).toBe(200)
    expect(live.single).toHaveBeenCalledTimes(4)
    expect(await readSubscribedTask(row.id, 'zh')).toBe(200)
    expect(live.single).toHaveBeenCalledTimes(5)
  })

  it.each([503, 403])('reports a failed Chinese check after confirming English (%s)', async status => {
    const row = { id: 'task-1', status: 'completed' }
    const check = vi.fn()
    const listener = vi.fn()
    live.single.mockResolvedValue({ data: row })
    cleanups.push(subscribeToTask(row.id, listener, check))
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(row, false))
    expect(await readSubscribedTask(row.id, 'en')).toBe(200)
    expect(listener).toHaveBeenLastCalledWith(row, 'en')
    live.single.mockResolvedValueOnce({ data: null, status })
    expect(await readSubscribedTask(row.id, 'zh')).toBe(status)
    expect(check).toHaveBeenLastCalledWith(status === 503 ? 'failed' : 'unavailable')
    expect(listener).toHaveBeenCalledTimes(2)
    if (status === 503) {
      const retry = readSubscribedTask(row.id, 'zh')
      expect(check).toHaveBeenLastCalledWith('rechecking')
      expect(await retry).toBe(200)
      expect(listener).toHaveBeenLastCalledWith(row, 'zh')
      expect(check).toHaveBeenLastCalledWith(undefined)
    }
    expect(live.single).toHaveBeenCalledTimes(status === 503 ? 4 : 3)
  })

  it.each(['initial-first', 'connected-first'])('uses the post-connect result when reads overlap (%s)', async order => {
    let initial!: (value: unknown) => void
    let connected!: (value: unknown) => void
    live.single.mockReturnValueOnce(new Promise(resolve => { initial = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { connected = resolve }))
    const listener = vi.fn()
    cleanups.push(subscribeToTask('task-1', listener))
    const manual = readSubscribedTask('task-1')
    expect(live.channel).toHaveBeenCalledWith('shared_task_task-1', { config: { postgres_changes_options: { wait: true } } })
    onStatus('SUBSCRIBED')
    onStatus('SUBSCRIBED')
    const shared = readSubscribedTask('task-1')
    expect(live.single).toHaveBeenCalledTimes(2)
    const stale = { data: { id: 'task-1', locale: 'en' } }
    if (order === 'initial-first') {
      initial(stale)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(listener).not.toHaveBeenCalled()
    }
    connected({ data: { id: 'task-1', locale: 'zh' } })
    expect(await Promise.all([manual, shared])).toEqual([200, 200])
    if (order === 'connected-first') initial(stale)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(listener).toHaveBeenCalledExactlyOnceWith({ id: 'task-1', locale: 'zh' }, true)
    onStatus('CHANNEL_ERROR')
    onStatus('SUBSCRIBED')
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    expect(live.single).toHaveBeenCalledTimes(3)
  })

  it('does not restore a pre-connection row after the new read fails or continue after close', async () => {
    let initial!: (value: unknown) => void
    live.single.mockReturnValueOnce(new Promise(resolve => { initial = resolve }))
      .mockResolvedValueOnce({ data: null, status: 503 })
    const listener = vi.fn()
    const check = vi.fn()
    cleanups.push(subscribeToTask('task-1', listener, check))
    const waiting = readSubscribedTask('task-1')
    onStatus('SUBSCRIBED')
    expect(await waiting).toBe(503)
    initial({ data: { id: 'task-1', status: 'completed' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(listener).not.toHaveBeenCalled()
    expect(check).toHaveBeenLastCalledWith('failed')
    live.single.mockReturnValueOnce(new Promise(() => {}))
    const pending = readSubscribedTask('task-1')
    cleanups.shift()!()
    expect(await pending).toBe(404)
    onStatus('CLOSED')
    onStatus('SUBSCRIBED')
    expect(live.single).toHaveBeenCalledTimes(3)
  })

  it('does not overwrite a newer realtime event with a delayed initial read', async () => {
    let resolveRead!: (value: unknown) => void
    live.single.mockReturnValue(new Promise((resolve) => { resolveRead = resolve }))
    const listener = vi.fn()
    cleanups.push(subscribeToTask('task-1', listener))
    onRow({ new: { id: 'task-1', status: 'completed', updated_at: '2026-09-07T02:00:00Z' } })
    resolveRead({ data: { id: 'task-1', status: 'processing', updated_at: '2026-09-07T01:00:00Z' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.lastCall?.[0].status).toBe('completed')
  })
})
