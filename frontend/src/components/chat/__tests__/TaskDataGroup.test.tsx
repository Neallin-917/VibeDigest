import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskDataGroup } from '../TaskDataGroup'
import { LANDING_DEMO } from '@/lib/landing-demo'
import landingDemoSummaries from '@/lib/fixtures/landing-demo-summaries.json'
import { matchPublicSummaryOutput } from '@/lib/summary-contract'
import { getRawMessages } from '@/lib/i18n-messages'
import { createTranslator } from '@/lib/i18n'

const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))

const { mockSubscribeToTask, mockRemoveChannel, mockReadTaskOutputs } = vi.hoisted(() => ({
  mockSubscribeToTask: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockReadTaskOutputs: vi.fn(),
}))

const demoState = vi.hoisted(() => ({ enabled: false }))
const i18nState = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' | 'ja' }))

const router = { refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))
let notifyOutput: ((payload: unknown) => void) | undefined
let notifyConnection: ((status: string) => void) | undefined
let taskOutputRows: Array<Record<string, unknown>> = []

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === 'chat.tools.status.captionServiceUnavailable' || key === 'chat.tools.status.captionsRateLimited' || key === 'chat.tools.status.captionsUnavailable' || key === 'chat.tools.status.unsupportedSource') {
        return createTranslator(getRawMessages(i18nState.locale === 'zh' ? 'zh' : 'en'))(key)
      }
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
            order: () => mockReadTaskOutputs(),
          }),
        }),
      }),
    }),
    channel: () => ({
      on: (_event: string, _filter: unknown, listener: (payload: unknown) => void) => {
        notifyOutput = listener
        return { subscribe: (callback: (status: string) => void) => { notifyConnection = callback; return {} } }
      },
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
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    notifyOutput = undefined
    notifyConnection = undefined
    mockReadTaskOutputs.mockReset().mockImplementation(async () => ({ data: taskOutputRows }))
    taskOutputRows = []
    demoState.enabled = false
    i18nState.locale = 'en'
    vi.clearAllMocks()
    mockSubscribeToTask.mockImplementation((id, listener) => {
      listener({ id, status: 'completed', is_demo: false, guest_id: null, workload_kind: 'user_submission' })
      return vi.fn()
    })
  })

  function pendingOutputRead() {
    type Result = { data: Array<Record<string, unknown>> | null; status?: number }
    let complete!: (result: Result) => void
    const promise = new Promise<Result>(resolve => { complete = resolve })
    mockReadTaskOutputs.mockReturnValueOnce(promise)
    return (result: Result) => act(async () => { complete(result) })
  }

  const existing = { data: landingDemoSummaries.outputs }
  const overview = matchPublicSummaryOutput(existing.data, 'en').summary!.overview

  it('shows an initial digest while the subscription catch-up is pending or unavailable', async () => {
    const initial = pendingOutputRead()
    const catchUp = pendingOutputRead()
    const reconnect = pendingOutputRead()
    render(<TaskDataGroup taskStatus={landingTaskStatus} />)
    act(() => notifyConnection?.('SUBSCRIBED'))
    await initial(existing)
    expect(screen.getByText(overview)).toBeInTheDocument()
    await catchUp({ data: null, status: 503 })
    expect(screen.getByText(overview)).toBeInTheDocument()
    act(() => notifyConnection?.('SUBSCRIBED'))
    await reconnect({ data: [] })
    expect(screen.queryByText(overview)).not.toBeInTheDocument()
  })

  it.each([
    { data: [] }, { data: null, status: 403 },
  ])('keeps a late initial read from replacing a newer empty or inaccessible result', async result => {
    const initial = pendingOutputRead()
    const catchUp = pendingOutputRead()
    render(<TaskDataGroup taskStatus={landingTaskStatus} />)
    act(() => notifyConnection?.('SUBSCRIBED'))
    await catchUp(result)
    await initial(existing)
    expect(screen.queryByText(overview)).not.toBeInTheDocument()
  })

  it('ignores a previous task’s response and connection callback after switching cards', async () => {
    const previous = pendingOutputRead()
    const current = pendingOutputRead()
    const { rerender } = render(<TaskDataGroup taskStatus={landingTaskStatus} />)
    const oldConnection = notifyConnection
    rerender(<TaskDataGroup taskStatus={{ ...landingTaskStatus, taskId: 'another-task' }} />)
    await current(existing)
    act(() => oldConnection?.('SUBSCRIBED'))
    await previous({ data: [] })
    expect(screen.getByText(overview)).toBeInTheDocument()
    expect(mockReadTaskOutputs).toHaveBeenCalledTimes(2)
  })

  it('waits for the current read before requesting a missing private language', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) })
    vi.stubGlobal('fetch', post)
    const initial = pendingOutputRead()
    const catchUp = pendingOutputRead()
    render(<TaskDataGroup live taskStatus={{ ...landingTaskStatus, taskId: 'private-task' }} />)
    act(() => notifyConnection?.('SUBSCRIBED'))
    await initial({ data: [] })
    expect(post).not.toHaveBeenCalled()
    await catchUp(existing)
    expect(screen.getByText(overview)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it.each(['available', 'missing', 'unconfirmed'])('checks the selected locale against the latest read (%s)', async outcome => {
    const englishOnly = { data: existing.data.filter(row => row.content.language === 'en') }
    const post = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) })
    vi.stubGlobal('fetch', post)
    const initial = pendingOutputRead()
    const refresh = pendingOutputRead()
    const props = { ...landingTaskStatus, taskId: 'private-task' }
    const { rerender } = render(<TaskDataGroup live taskStatus={props} />)
    await initial(englishOnly)
    expect(screen.getByText(overview)).toBeInTheDocument()

    act(() => notifyConnection?.('SUBSCRIBED'))
    expect(screen.getByText(overview)).toBeInTheDocument()
    i18nState.locale = 'zh'
    rerender(<TaskDataGroup live taskStatus={{ ...props }} />)
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByText(overview)).not.toBeInTheDocument()

    if (outcome === 'available') {
      await refresh(existing)
      expect(screen.getByText(matchPublicSummaryOutput(existing.data, 'zh').summary!.overview)).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    } else if (outcome === 'missing') {
      await refresh(englishOnly)
      await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/api/tasks/private-task/summary-version',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ locale: 'zh' }) })))
    } else {
      await refresh({ data: null, status: 503 })
      expect(post).not.toHaveBeenCalled()
      const reconnect = pendingOutputRead()
      act(() => notifyConnection?.('SUBSCRIBED'))
      await reconnect(existing)
      expect(screen.getByText(matchPublicSummaryOutput(existing.data, 'zh').summary!.overview)).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    }
  })

  it('keeps an already requested language stable across a catch-up that still reports it missing', async () => {
    i18nState.locale = 'zh'
    const post = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) })
    vi.stubGlobal('fetch', post)
    const initial = pendingOutputRead()
    const refresh = pendingOutputRead()
    const englishOnly = { data: existing.data.filter(row => row.content.language === 'en') }
    render(<TaskDataGroup live taskStatus={{ ...landingTaskStatus, taskId: 'private-task' }} />)
    await initial(englishOnly)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    act(() => notifyConnection?.('SUBSCRIBED'))
    expect(screen.getByRole('status')).toHaveTextContent('正在准备中文版')
    await refresh(englishOnly)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to the English landing digest when the route changes to Japanese', async () => {
    taskOutputRows = landingDemoSummaries.outputs
    const { rerender } = render(<TaskDataGroup taskStatus={landingTaskStatus} />)
    const english = matchPublicSummaryOutput(landingDemoSummaries.outputs, 'en').summary!
    await screen.findByText(english.tl_dr!)

    i18nState.locale = 'ja'
    rerender(<TaskDataGroup taskStatus={{ ...landingTaskStatus }} />)
    expect(screen.queryByText(english.tl_dr!)).not.toBeInTheDocument()
    expect(mockReadTaskOutputs).toHaveBeenCalledOnce()
    expect(screen.getByText('No summary available.')).toBeVisible()
    expect(screen.queryByText(english.overview)).not.toBeInTheDocument()
  })

  it('prepares the missing UI language once, then displays the committed version on the same card', async () => {
    i18nState.locale = 'zh'
    taskOutputRows = landingDemoSummaries.outputs.filter(output => output.content.language === 'en')
    const post = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) })
    vi.stubGlobal('fetch', post)
    mockSubscribeToTask.mockImplementation((id, listener) => {
      listener({ id, status: 'completed', workload_kind: 'user_submission', is_demo: false, guest_id: null })
      return vi.fn()
    })
    render(<TaskDataGroup live taskStatus={{ ...landingTaskStatus, taskId: 'private-task' }} />)

    expect(await screen.findByText('正在准备中文版…')).toBeVisible()
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/tasks/private-task/summary-version', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ locale: 'zh' }),
    }))
    const english = matchPublicSummaryOutput(landingDemoSummaries.outputs, 'en').summary!
    expect(screen.queryByText(english.tl_dr!)).not.toBeInTheDocument()

    taskOutputRows = landingDemoSummaries.outputs
    act(() => notifyOutput?.({ new: { kind: 'summary' } }))
    expect(await screen.findByText(matchPublicSummaryOutput(landingDemoSummaries.outputs, 'zh').summary!.tl_dr!)).toBeVisible()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('follows an explicit language change while the new version is still processing', async () => {
    i18nState.locale = 'zh'
    taskOutputRows = [
      ...landingDemoSummaries.outputs.filter(output => output.content.language === 'en'),
      { kind: 'summary', locale: 'zh', status: 'processing' },
    ]
    const fetchVersion = vi.fn()
    vi.stubGlobal('fetch', fetchVersion)
    const row = {
      id: 'private-task', status: 'completed', workload_kind: 'user_submission', is_demo: false,
      guest_id: null, output_intent: { locale_source: 'explicit_instruction', target_locale: 'en' },
    }
    let publishTask: ((row: Record<string, unknown>) => void) | undefined
    mockSubscribeToTask.mockImplementation((_id, listener) => {
      publishTask = listener
      listener(row)
      return vi.fn()
    })
    render(<TaskDataGroup live taskStatus={{ ...landingTaskStatus, taskId: row.id }} />)
    expect(await screen.findByText(matchPublicSummaryOutput(landingDemoSummaries.outputs, 'en').summary!.tl_dr!)).toBeVisible()
    act(() => publishTask?.({ ...row, output_intent: { ...row.output_intent, preferred_summary_locale: 'zh' } }))
    expect(await screen.findByText('正在准备中文版…')).toBeVisible()
    expect(screen.queryByText(matchPublicSummaryOutput(landingDemoSummaries.outputs, 'en').summary!.tl_dr!)).not.toBeInTheDocument()
    taskOutputRows = landingDemoSummaries.outputs
    act(() => notifyOutput?.({ new: { kind: 'summary' } }))
    expect(await screen.findByText(matchPublicSummaryOutput(landingDemoSummaries.outputs, 'zh').summary!.tl_dr!)).toBeVisible()
    expect(fetchVersion).not.toHaveBeenCalled()
  })

  it('keeps a public task without a matching language read-only', async () => {
    i18nState.locale = 'zh'
    taskOutputRows = landingDemoSummaries.outputs.filter(output => output.content.language === 'en')
    const fetchVersion = vi.fn()
    vi.stubGlobal('fetch', fetchVersion)
    mockSubscribeToTask.mockImplementation((id, listener) => {
      listener({ id, status: 'completed', is_demo: true, guest_id: null, workload_kind: 'user_submission' })
      return vi.fn()
    })
    render(<TaskDataGroup live taskStatus={landingTaskStatus} />)
    await waitFor(() => expect(mockReadTaskOutputs).toHaveBeenCalledOnce())
    expect(screen.getByText('No summary available.')).toBeVisible()
    expect(fetchVersion).not.toHaveBeenCalled()
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

  it.each([
    ['ar', 'rtl'],
    [null, 'auto'],
    ['invalid tag', 'auto'],
  ])('uses only the matched summary’s source language (%s) to direct its evidence', async (language, direction) => {
    const arabic = 'OpenRouter يدعم الإصدار 2026.'
    const english = 'The Arabic word مرحبا means hello.'
    taskOutputRows = ['zh', 'en'].map(locale => ({
      kind: 'summary', status: 'completed', locale,
      transcript_language: locale === 'en' ? language : 'en',
      content: {
        version: 5, language: locale, overview: 'Overview',
        keypoints: [
          { title: 'First', detail: 'First detail', evidence: arabic },
          { title: 'Second', detail: 'Second detail', evidence: english },
        ],
      },
    }))
    render(<TaskDataGroup taskStatus={landingTaskStatus} />)
    const passage = await screen.findByText(arabic)
    expect(passage).toHaveAttribute('dir', direction)
    if (direction === 'rtl') expect(passage).toHaveAttribute('lang', 'ar')
    expect(screen.getByText(english)).toHaveAttribute('dir', 'auto')
    expect(screen.getByText(english)).not.toHaveAttribute('lang')
    const row = passage.closest('li')!
    expect(row).not.toHaveAttribute('dir')
    expect(row.querySelector('span')).toHaveTextContent('01')
    expect(mockReadTaskOutputs).toHaveBeenCalledTimes(1)
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
    expect(screen.getByText('A source quote.').tagName).toBe('P')
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

  it.each([
    ['en', 'captions_unavailable: provider_unavailable', 'The caption service is temporarily unavailable. Submit this video again later.'],
    ['en', 'captions_unavailable: rate_limited', 'Caption requests are temporarily limited. Submit this video again later.'],
    ['zh', 'captions_unavailable: provider_unavailable', '字幕服务暂时无法响应，请稍后重新提交此视频。'],
    ['zh', 'captions_unavailable: rate_limited', '字幕服务暂时限流，请稍后重新提交此视频。'],
    ['en', 'captions_unavailable', 'We couldn’t retrieve usable captions for this video. Try another YouTube video with captions.'],
    ['zh', 'captions_unavailable', '这次未能取得可用字幕，请试试其他带字幕的 YouTube 视频。'],
    ['en', 'unsupported_source', 'This source is not supported. Try a YouTube video with existing captions.'],
    ['zh', 'unsupported_source', '暂不支持此来源，请换一个已有字幕的 YouTube 视频。'],
  ] as const)('localizes permanent source failures without offering retry: %s %s', (locale, code, message) => {
    i18nState.locale = locale
    const onRetryTask = vi.fn()
    render(
      <TaskDataGroup
        onRetryTask={onRetryTask}
        taskStatus={{
          taskId: 'task-without-captions',
          status: 'failed',
          videoUrl: 'https://www.youtube.com/watch?v=video-789',
          errorMessage: `${code}: upstream provider diagnostic`,
        }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/upstream provider diagnostic/)).not.toBeInTheDocument()
    expect(screen.queryByText(/refund|退额|退还/i)).not.toBeInTheDocument()
    expect(onRetryTask).not.toHaveBeenCalled()
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
