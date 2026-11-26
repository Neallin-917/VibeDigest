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
