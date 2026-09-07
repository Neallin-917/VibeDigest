import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const live = vi.hoisted(() => ({ single: vi.fn(), removeChannel: vi.fn(), channel: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({
  channel: live.channel,
  removeChannel: live.removeChannel,
  from: () => ({ select: () => ({ eq: () => ({ single: live.single }) }) }),
}) }))
import { subscribeToTask } from './task-live'

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
