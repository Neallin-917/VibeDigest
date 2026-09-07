import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskDataGroup } from '../TaskDataGroup'

const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))

const { mockSubscribeToTask, mockRemoveChannel } = vi.hoisted(() => ({
  mockSubscribeToTask: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

const demoState = vi.hoisted(() => ({ enabled: false }))

let taskOutputRows: Array<Record<string, unknown>> = []

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'chat.tools.status.videoTask': 'Video task',
        'chat.tools.status.statusReady': 'Ready',
        'chat.tools.status.statusFailed': 'Failed',
        'chat.tools.status.statusQueued': 'Queued',
        'chat.tools.status.steps.ingestLabel': 'Getting video details',
        'chat.tools.status.steps.transcribeLabel': 'Transcribing',
        'chat.tools.status.steps.summarizeLabel': 'Writing knowledge cards',
        'tasks.summaryStructured.tldrTitle': 'One conclusion',
        'tasks.summaryStructured.keypointsTitle': 'Key insights',
        'tasks.summaryStructured.continueReading': 'Continue reading',
        'tasks.summaryStructured.sectionsTitle': 'Sections',
        'tasks.summaryStructured.evidenceLabel': 'Evidence',
        'chat.inlineResult.noSummary': 'No summary available.',
        'chat.directSubmit.unavailable': 'Unable to process this video right now.',
        'chat.retry': 'Retry',
        'chat.retryQueued': 'Retry queued',
      }
      return labels[key] ?? key
    },
    locale: 'en',
  }),
}))

vi.mock('@/lib/task-live', () => ({
  subscribeToTask: mockSubscribeToTask,
}))

vi.mock('@/lib/growth-events', () => growth)

vi.mock('@/lib/local-ui-demo', () => ({
  isLocalUiDemo: () => demoState.enabled,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: async () => ({ data: taskOutputRows }),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: mockRemoveChannel,
  }),
}))

describe('TaskDataGroup', () => {
  beforeEach(() => {
    taskOutputRows = []
    demoState.enabled = false
    vi.clearAllMocks()
  })

  it('renders the embedded player as soon as live video metadata arrives', async () => {
    let publishTask: ((row: Record<string, unknown>) => void) | undefined
    mockSubscribeToTask.mockImplementation((_taskId, listener) => {
      publishTask = listener
      return vi.fn()
    })

    render(
      <TaskDataGroup
        live
        taskStatus={{
          taskId: 'task-123',
          status: 'processing',
          progress: 15,
          videoUrl: 'https://www.youtube.com/watch?v=video-123',
        }}
      />
    )

    expect(screen.getByText('Getting video details')).toBeInTheDocument()
    expect(screen.queryByTitle('A retrieved source')).not.toBeInTheDocument()

    act(() => {
      publishTask?.({
        id: 'task-123',
        status: 'processing',
        progress: 25,
        video_title: 'A retrieved source',
        video_url: 'https://www.youtube.com/watch?v=video-123',
      })
    })

    expect(await screen.findByTitle('A retrieved source')).toHaveAttribute(
      'src',
      expect.stringContaining('/embed/video-123')
    )
    expect(screen.getByText('Getting video details')).toBeInTheDocument()
  })

  it('adds concise knowledge cards when the persisted summary becomes available', async () => {
    taskOutputRows = [
      {
        kind: 'summary',
        status: 'completed',
        locale: 'en',
        content: JSON.stringify({
          version: 4,
          language: 'en',
          tl_dr: 'The video argues for deliberate practice.',
          overview: 'An overview.',
          keypoints: [
            { title: 'Practice feedback loops', detail: 'Review work often.', evidence: '00:32' },
            { title: 'Protect focus', detail: 'Use uninterrupted sessions.', evidence: '01:10' },
            { title: 'Read the full result', detail: 'Keep the details close to the first screen.', evidence: '02:03' },
          ],
          ui_blocks: [
            {
              kind: 'comparison_table',
              id: 'comparison-1',
              title: 'Compare practice modes',
              columns: ['Solo', 'Coached'],
              rows: [
                { label: 'Feedback', values: ['Delayed', 'Immediate'], evidence: 'A source quote.' },
                { label: 'Cost', values: ['Lower', 'Higher'], evidence: 'Another source quote.' },
              ],
            },
          ],
          sections: [
            {
              section_type: 'takeaways',
              title: 'A practical next step',
              description: 'Apply the feedback loop to one important task this week.',
              items: [{ content: 'Choose a repeatable practice and review it after every attempt.' }],
            },
          ],
        }),
      },
    ]

    render(
      <TaskDataGroup
        taskStatus={{
          taskId: 'task-456',
          status: 'completed',
          progress: 100,
          videoTitle: 'A complete source',
          videoUrl: 'https://www.youtube.com/watch?v=video-456',
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('The video argues for deliberate practice.')).toBeInTheDocument()
    })
    expect(screen.getByText('One conclusion')).toBeInTheDocument()
    expect(screen.getByText('Key insights')).toBeInTheDocument()
    expect(screen.getAllByText('Practice feedback loops')).toHaveLength(1)
    expect(screen.getAllByText('Protect focus')).toHaveLength(1)
    expect(screen.getByText('Compare practice modes')).toBeInTheDocument()
    expect(screen.getByText('Immediate')).toBeInTheDocument()
    expect(screen.getByText('Read the full result')).toBeInTheDocument()
    expect(screen.getByText('A practical next step')).toBeInTheDocument()
    expect(screen.getByText('Continue reading').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.queryByText('00:32')).not.toBeInTheDocument()
    expect(screen.getByText('A source quote.')).toBeInTheDocument()
    await waitFor(() => {
      expect(growth.trackGrowthEvent).toHaveBeenCalledExactlyOnceWith('task_result_view', {
        locale: 'en',
      })
    })
  })

  it('tracks a completed rendered result only once per mounted task', async () => {
    taskOutputRows = [
      {
        kind: 'summary',
        status: 'completed',
        locale: 'en',
        content: JSON.stringify({
          version: 4,
          language: 'en',
          overview: 'An overview.',
          keypoints: [
            { title: 'One', detail: 'Detail', evidence: 'Evidence' },
          ],
          sections: [],
        }),
      },
    ]

    const props = {
      taskStatus: {
        taskId: 'task-dedupe',
        status: 'completed' as const,
        progress: 100,
        videoTitle: 'A complete source',
        videoUrl: 'https://www.youtube.com/watch?v=video-456',
      },
    }

    const { rerender } = render(<TaskDataGroup {...props} />)

    await waitFor(() => {
      expect(screen.getByText('An overview.')).toBeInTheDocument()
    })

    rerender(<TaskDataGroup {...props} />)

    expect(growth.trackGrowthEvent).toHaveBeenCalledTimes(1)
  })

  it('shows a sanitized failure without reviving the old progress panel', () => {
    render(
      <TaskDataGroup
        taskStatus={{
          taskId: 'task-789',
          status: 'failed',
          progress: 70,
          videoUrl: 'https://www.youtube.com/watch?v=video-789',
          errorMessage: 'litellm.BadGatewayError: unknown provider',
        }}
      />
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Unable to process this video right now.')).toBeInTheDocument()
    expect(screen.queryByText(/litellm/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/processing plan/i)).not.toBeInTheDocument()
  })

  it('offers an owned failed task a single retry action', async () => {
    const onRetryTask = vi.fn().mockResolvedValue(true)

    render(
      <TaskDataGroup
        onRetryTask={onRetryTask}
        taskStatus={{
          taskId: 'task-789',
          status: 'failed',
          progress: 70,
          videoUrl: 'https://www.youtube.com/watch?v=video-789',
          errorMessage: 'Temporary upstream failure',
        }}
      />
    )

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click()
    })

    expect(onRetryTask).toHaveBeenCalledWith('task-789')
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()
  })

  it('keeps recovery available when a failed task has no error detail', () => {
    render(
      <TaskDataGroup
        onRetryTask={vi.fn().mockResolvedValue(true)}
        taskStatus={{
          taskId: 'task-without-error',
          status: 'failed',
          videoUrl: 'https://www.youtube.com/watch?v=video-789',
        }}
      />
    )

    expect(screen.getByText('Unable to process this video right now.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('allows another retry after an accepted retry processes and fails again', async () => {
    let publishTask: ((row: Record<string, unknown>) => void) | undefined
    mockSubscribeToTask.mockImplementation((_taskId, listener) => {
      publishTask = listener
      return vi.fn()
    })
    const onRetryTask = vi.fn().mockResolvedValue(true)
    render(
      <TaskDataGroup
        live
        onRetryTask={onRetryTask}
        taskStatus={{
          taskId: 'task-retry', status: 'failed',
          videoUrl: 'https://www.youtube.com/watch?v=video-retry',
          errorMessage: 'Previous failure',
        }}
      />
    )

    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()

    act(() => { publishTask?.({ id: 'task-retry', status: 'processing', progress: 35 }) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Transcribing')).toBeInTheDocument()

    act(() => { publishTask?.({ id: 'task-retry', status: 'failed' }) })
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(onRetryTask).toHaveBeenCalledTimes(2)
  })

  it.each(['rejected', 'thrown'])('unlocks retry when the request is %s', async (outcome) => {
    const onRetryTask = outcome === 'rejected'
      ? vi.fn().mockResolvedValue(false)
      : vi.fn().mockRejectedValue(new Error('Network unavailable'))
    render(
      <TaskDataGroup
        onRetryTask={onRetryTask}
        taskStatus={{
          taskId: 'task-retry', status: 'failed',
          videoUrl: 'https://www.youtube.com/watch?v=video-retry',
        }}
      />
    )
    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('unlocks for a newer failed row even when the intermediate retry events were missed', async () => {
    let publishTask: ((row: Record<string, unknown>) => void) | undefined
    const originalFailure = {
      id: 'task-retry', status: 'failed', updated_at: '2026-09-07T04:00:00.000Z',
    }
    mockSubscribeToTask.mockImplementation((_taskId, listener) => {
      publishTask = listener
      listener(originalFailure)
      return vi.fn()
    })
    const onRetryTask = vi.fn().mockResolvedValue(true)
    render(
      <TaskDataGroup
        live
        onRetryTask={onRetryTask}
        taskStatus={{
          taskId: 'task-retry', status: 'failed',
          videoUrl: 'https://www.youtube.com/watch?v=video-retry',
        }}
      />
    )

    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()

    // Reconnects may replay the original or an older failed record.
    act(() => { publishTask?.(originalFailure) })
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()
    act(() => { publishTask?.({ ...originalFailure, updated_at: '2026-09-07T03:59:59.000Z' }) })
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()
    expect(onRetryTask).toHaveBeenCalledTimes(1)

    act(() => { publishTask?.({ ...originalFailure, updated_at: '2026-09-07T04:01:00.000Z' }) })
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    await act(async () => { screen.getByRole('button', { name: 'Retry' }).click() })
    expect(onRetryTask).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()

    act(() => { publishTask?.({ ...originalFailure, updated_at: '2026-09-07T04:01:00.000Z' }) })
    expect(screen.getByRole('button', { name: 'Retry queued' })).toBeDisabled()
  })

  it('replays the local visual demo without querying Supabase', async () => {
    demoState.enabled = true
    vi.useFakeTimers()

    try {
      render(
        <TaskDataGroup
          live
          taskStatus={{
            taskId: 'demo-task',
            status: 'pending',
            progress: 0,
            videoUrl: 'https://www.youtube.com/watch?v=demo-video',
          }}
        />
      )

      expect(screen.getByText('Queued')).toBeInTheDocument()
      expect(mockSubscribeToTask).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(screen.getByTitle('Local demo: shortening the feedback loop with AI')).toBeInTheDocument()
      expect(screen.getByText('Transcribing')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100)
      })

      expect(screen.getByText('AI becomes useful when feedback, judgment, and action form a shorter loop.')).toBeInTheDocument()
      expect(screen.getAllByText('Show useful feedback early')).toHaveLength(2)
      expect(screen.getByText('Keep the interface focused')).toBeInTheDocument()
      expect(growth.trackGrowthEvent).not.toHaveBeenCalledWith('task_result_view', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })
})
