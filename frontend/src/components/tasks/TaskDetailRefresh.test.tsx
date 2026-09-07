import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskDetailRefresh } from './TaskDetailRefresh'

const live = vi.hoisted(() => ({
  refresh: vi.fn(), removeChannel: vi.fn(),
  listeners: {} as Record<string, (payload: { new: Record<string, unknown> }) => void>,
  status: vi.fn<(status: string) => void>(),
}))
const router = { refresh: live.refresh }
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({
  channel: () => {
    const channel = {
      on: (_event: string, filter: { table: string }, callback: typeof live.listeners[string]) => {
        live.listeners[filter.table] = callback
        return channel
      },
      subscribe: (callback: typeof live.status) => { live.status = callback; return channel },
    }
    return channel
  },
  removeChannel: live.removeChannel,
}) }))

describe('TaskDetailRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); live.listeners = {} })
  afterEach(() => { vi.useRealTimers() })

  it('coalesces committed task and summary changes into one server refresh', () => {
    render(<TaskDetailRefresh taskId="task-1" />)
    act(() => {
      live.listeners.tasks({ new: { status: 'completed' } })
      live.listeners.task_outputs({ new: { kind: 'summary', status: 'completed' } })
      vi.advanceTimersByTime(120)
    })
    expect(live.refresh).toHaveBeenCalledTimes(1)
    act(() => { live.listeners.task_outputs({ new: { kind: 'transcript' } }); vi.advanceTimersByTime(120) })
    expect(live.refresh).toHaveBeenCalledTimes(1)
  })

  it('covers subscription gaps and reconnection without polling', () => {
    render(<TaskDetailRefresh taskId="task-1" />)
    act(() => { live.status('SUBSCRIBED'); vi.advanceTimersByTime(120) })
    expect(live.refresh).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(live.refresh).toHaveBeenCalledTimes(1)
    act(() => { live.status('SUBSCRIBED'); vi.advanceTimersByTime(120) })
    expect(live.refresh).toHaveBeenCalledTimes(2)
  })

  it('removes the previous subscription and cancels pending refresh on navigation', () => {
    const view = render(<TaskDetailRefresh taskId="task-1" />)
    const oldListener = live.listeners.tasks
    act(() => { oldListener({ new: { status: 'completed' } }) })
    view.rerender(<TaskDetailRefresh taskId="task-2" />)
    expect(live.removeChannel).toHaveBeenCalledTimes(1)
    act(() => { oldListener({ new: { status: 'failed' } }); vi.advanceTimersByTime(120) })
    expect(live.refresh).not.toHaveBeenCalled()
    view.unmount()
    expect(live.removeChannel).toHaveBeenCalledTimes(2)
  })
})
