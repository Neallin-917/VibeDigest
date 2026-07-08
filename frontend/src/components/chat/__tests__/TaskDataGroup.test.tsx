import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TaskDataGroup } from '../TaskDataGroup'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'chat.tools.status.viewSummary') return 'View summary'
      if (key === 'chat.tools.status.videoTask') return 'Video task'
      if (key === 'chat.tools.status.statusReady') return 'Ready'
      if (key === 'chat.tools.status.statusFailed') return 'Failed'
      if (key === 'chat.tools.status.statusProcessing') return 'Processing'
      if (key === 'chat.tools.status.statusQueued') return 'Queued'
      if (key === 'chat.tools.status.processingPlan') return 'Processing plan'
      if (key === 'chat.tools.status.processingPlanDesc') return 'Live task progress'
      if (key === 'chat.tools.status.progressCount') {
        return `${values?.completed as number}/${values?.total as number}`
      }
      if (key === 'chat.tools.status.steps.queuedLabel') return 'Queued'
      if (key === 'chat.tools.status.steps.queuedDesc') return 'Queued desc'
      if (key === 'chat.tools.status.steps.ingestLabel') return 'Ingest'
      if (key === 'chat.tools.status.steps.ingestDesc') return 'Ingest desc'
      if (key === 'chat.tools.status.steps.transcribeLabel') return 'Transcribe'
      if (key === 'chat.tools.status.steps.transcribeDesc') return 'Transcribe desc'
      if (key === 'chat.tools.status.steps.summarizeLabel') return 'Summarize'
      if (key === 'chat.tools.status.steps.summarizeDesc') return 'Summarize desc'
      if (key === 'chat.tools.status.steps.finalizeLabel') return 'Finalize'
      if (key === 'chat.tools.status.steps.finalizeDesc') return 'Finalize desc'
      return key
    },
    locale: 'en',
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: vi.fn(),
  }),
}))

describe('TaskDataGroup', () => {
  it('shows a completion CTA and opens the result panel', () => {
    const onOpenPanel = vi.fn()

    render(
      <TaskDataGroup
        taskStatus={{
          taskId: 'task-123',
          status: 'completed',
          progress: 100,
          videoTitle: 'Finished task',
        }}
        showProgress
        showPlan
        onOpenPanel={onOpenPanel}
      />
    )

    const button = screen.getByText('View summary')
    expect(button.className).toContain('bg-zinc-100')
    fireEvent.click(button)
    expect(onOpenPanel).toHaveBeenCalledWith('task-123')
  })

  it('renders backend error status as failed without raw HTML details', () => {
    render(
      <TaskDataGroup
        taskStatus={{
          taskId: 'task-123',
          status: 'error' as never,
          progress: 100,
          errorMessage:
            '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>',
        }}
        showProgress
        showPlan
      />
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/blocking automated access/)).toBeInTheDocument()
    expect(screen.queryByText(/<!DOCTYPE/)).not.toBeInTheDocument()
  })
})
