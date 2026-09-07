import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskDataGroup } from '../TaskDataGroup'
import { LANDING_DEMO } from '@/lib/landing-demo'
import landingDemoSummaries from '@/lib/fixtures/landing-demo-summaries.json'

const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))

const { mockSubscribeToTask, mockRemoveChannel, mockReadTaskOutputs } = vi.hoisted(() => ({
  mockSubscribeToTask: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockReadTaskOutputs: vi.fn(),
}))

const demoState = vi.hoisted(() => ({ enabled: false }))
const i18nState = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' | 'ja' }))

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
    locale: i18nState.locale,
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
            order: async () => {
              mockReadTaskOutputs()
              return { data: taskOutputRows }
            },
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

const landingTaskStatus = {
  taskId: LANDING_DEMO.id,
  status: 'completed' as const,
  progress: 100,
  videoTitle: LANDING_DEMO.video_title,
  videoUrl: LANDING_DEMO.video_url,
  thumbnailUrl: LANDING_DEMO.thumbnail_url,
}

function expectDigestTextVisible(text: string) {
  const content = screen.getAllByText(text, { exact: false }).find(
    element => !element.closest('details:not([open])')
  )
  expect(content).toBeDefined()
  expect(content).toBeVisible()
}

describe('TaskDataGroup', () => {
  beforeEach(() => {
    taskOutputRows = []
    demoState.enabled = false
    i18nState.locale = 'en'
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

  it('shows the complete persisted digest without hiding its overview, insights, or sections', async () => {
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
            { title: 'Practice feedback loops', detail: 'Review work often.', evidence: '00:32', why_it_matters: 'Feedback makes practice measurable.' },
            { title: 'Protect focus', detail: 'Use uninterrupted sessions.', evidence: '01:10' },
            { title: 'Read the full result', detail: 'Keep the details close to the first screen.', evidence: '02:03' },
            { title: 'Track meaningful progress', detail: 'Record what improved after each attempt.', evidence: '03:04' },
            { title: 'Adjust the difficulty', detail: 'Choose a task just beyond current ability.', evidence: '04:05' },
            { title: 'Review the whole practice cycle', detail: 'Use the final review to plan the next session.', evidence: '05:06', why_it_matters: 'A complete cycle carries learning into future work.' },
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
            {
              section_type: 'lessons',
              title: 'A repeatable lesson',
              description: 'Keep feedback specific.',
              items: [{ content: 'Write down one change before the next attempt.' }],
            },
            {
              section_type: 'insights',
              title: 'A final observation',
              description: 'Consistency needs recovery.',
              items: [{ content: 'Leave time to recover between focused sessions.' }],
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
    for (const text of [
      'An overview.',
      'Feedback makes practice measurable.',
      'Track meaningful progress',
      'Record what improved after each attempt.',
      'Adjust the difficulty',
      'Choose a task just beyond current ability.',
      'Review the whole practice cycle',
      'Use the final review to plan the next session.',
      'A complete cycle carries learning into future work.',
      'A practical next step',
      'Choose a repeatable practice and review it after every attempt.',
      'A repeatable lesson',
      'Write down one change before the next attempt.',
      'A final observation',
      'Leave time to recover between focused sessions.',
    ]) expectDigestTextVisible(text)
    expect(screen.queryByText('Continue reading')).not.toBeInTheDocument()
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

  it.each(['en', 'zh'] as const)('opens the complete %s landing digest and keeps it after the generic demo timers finish', async (locale) => {
    demoState.enabled = true
    i18nState.locale = locale
    vi.useFakeTimers()

    try {
      const sourceSummary = landingDemoSummaries.outputs.find(
        output => output.content.language === locale
      )!.content
      expect(landingDemoSummaries.taskId).toBe(LANDING_DEMO.id)
      expect(sourceSummary.keypoints).toHaveLength(6)
      expect(sourceSummary.sections).toHaveLength(3)

      render(<TaskDataGroup live taskStatus={landingTaskStatus} />)

      expect(screen.getByTitle(LANDING_DEMO.video_title)).toHaveAttribute(
        'src', expect.stringContaining('/embed/zgNvts_2TUE')
      )
      expectDigestTextVisible(sourceSummary.tl_dr)
      expectDigestTextVisible(sourceSummary.overview)
      for (const point of sourceSummary.keypoints) {
        expectDigestTextVisible(point.title)
        expectDigestTextVisible(point.detail)
        expectDigestTextVisible(point.why_it_matters)
      }
      for (const section of sourceSummary.sections) {
        expectDigestTextVisible(section.title)
        expectDigestTextVisible(section.description)
        for (const item of section.items) expectDigestTextVisible(item.content)
      }
      expect(screen.queryByText('Continue reading')).not.toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_800)
      })

      expect(screen.getByTitle(LANDING_DEMO.video_title)).toBeInTheDocument()
      expectDigestTextVisible(sourceSummary.overview)
      expectDigestTextVisible(sourceSummary.keypoints[5].detail)
      expectDigestTextVisible(sourceSummary.sections[2].items[2].content)
      expect(screen.queryByTitle('Local demo: shortening the feedback loop with AI')).not.toBeInTheDocument()
      expect(screen.queryByText('AI becomes useful when feedback, judgment, and action form a shorter loop.')).not.toBeInTheDocument()
      expect(mockSubscribeToTask).not.toHaveBeenCalled()
      expect(mockReadTaskOutputs).not.toHaveBeenCalled()
      expect(growth.trackGrowthEvent).not.toHaveBeenCalledWith('task_result_view', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not substitute another language when the local landing digest has no Japanese summary', () => {
    demoState.enabled = true
    i18nState.locale = 'ja'

    render(<TaskDataGroup taskStatus={landingTaskStatus} />)

    expect(screen.getByTitle(LANDING_DEMO.video_title)).toBeInTheDocument()
    expect(screen.getByText('No summary available.')).toBeInTheDocument()
    for (const output of landingDemoSummaries.outputs) {
      expect(screen.queryByText(output.content.tl_dr)).not.toBeInTheDocument()
      expect(screen.queryByText(output.content.overview)).not.toBeInTheDocument()
    }
    expect(mockReadTaskOutputs).not.toHaveBeenCalled()
  })

  it('does not repeat the overview when it is identical to the conclusion', async () => {
    taskOutputRows = [{
      kind: 'summary',
      status: 'completed',
      locale: 'en',
      content: {
        version: 4,
        language: 'en',
        tl_dr: 'A single concise conclusion.',
        overview: 'A single concise conclusion.',
        keypoints: [{ title: 'One insight', detail: 'Its detail.', evidence: '00:32' }],
        sections: [],
      },
    }]

    render(<TaskDataGroup taskStatus={landingTaskStatus} />)

    expect(await screen.findByText('A single concise conclusion.')).toBeInTheDocument()
    expect(screen.getAllByText('A single concise conclusion.')).toHaveLength(1)
  })

  it('reads the landing case persisted output outside the local demo instead of substituting the captured snapshot', async () => {
    taskOutputRows = [{
      kind: 'summary',
      status: 'completed',
      locale: 'en',
      content: JSON.stringify({
        version: 4,
        language: 'en',
        tl_dr: 'The persisted source summary remains authoritative.',
        overview: 'A new overview saved after the local snapshot was captured.',
        keypoints: [{ title: 'Persisted insight', detail: 'A detail from the saved output.', evidence: '00:32', why_it_matters: 'The latest persisted output takes precedence.' }],
        sections: [],
      }),
    }]

    render(<TaskDataGroup taskStatus={landingTaskStatus} />)

    expect(await screen.findByText('The persisted source summary remains authoritative.')).toBeInTheDocument()
    expect(screen.getByText('Persisted insight')).toBeInTheDocument()
    expectDigestTextVisible('A new overview saved after the local snapshot was captured.')
    expectDigestTextVisible('The latest persisted output takes precedence.')
    expect(screen.getByTitle(LANDING_DEMO.video_title)).toBeInTheDocument()
    expect(mockReadTaskOutputs).toHaveBeenCalledOnce()
    for (const output of landingDemoSummaries.outputs) {
      expect(screen.queryByText(output.content.tl_dr)).not.toBeInTheDocument()
      expect(screen.queryByText(output.content.overview)).not.toBeInTheDocument()
    }
  })
})
