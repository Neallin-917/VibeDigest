import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskNotificationListener } from './TaskNotificationListener'

const { subscribeToTask, sendTaskNotification } = vi.hoisted(() => ({
  subscribeToTask: vi.fn(),
  sendTaskNotification: vi.fn(),
}))

vi.mock('@/hooks/useTaskNotification', () => ({
  useTaskNotification: () => ({
    subbedTaskIds: new Set(['task-1']),
    sendTaskNotification,
  }),
}))

vi.mock('@/lib/task-live', () => ({
  subscribeToTask,
}))

describe('TaskNotificationListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not notify for the initial completed snapshot, but notifies on transition to completed', () => {
    let callback: ((row: Record<string, unknown>) => void) | null = null

    subscribeToTask.mockImplementation((_taskId: string, listener: (row: Record<string, unknown>) => void) => {
      callback = listener
      return () => {}
    })

    render(<TaskNotificationListener />)

    const notifyTaskUpdate = (row: Record<string, unknown>) => {
      const currentCallback = callback
      if (currentCallback === null) {
        throw new Error('Expected subscribeToTask to register a listener')
      }

      currentCallback(row)
    }

    notifyTaskUpdate({
      id: 'task-1',
      status: 'completed',
      video_title: 'Existing task',
      video_url: 'https://example.com/existing',
    })

    expect(sendTaskNotification).not.toHaveBeenCalled()

    notifyTaskUpdate({
      id: 'task-1',
      status: 'processing',
      video_title: 'Existing task',
      video_url: 'https://example.com/existing',
    })

    notifyTaskUpdate({
      id: 'task-1',
      status: 'completed',
      video_title: 'Existing task',
      video_url: 'https://example.com/existing',
    })

    expect(sendTaskNotification).toHaveBeenCalledWith('task-1', 'Existing task')
  })
})
