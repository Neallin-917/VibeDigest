import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CreateTaskTool,
  GetTaskOutputsTool,
  GetTaskStatusTool,
  PreviewVideoTool,
  UnknownTool,
} from './index'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'chat.tools.create.success') return 'Task created'
      if (key === 'chat.tools.create.viewProgress') return 'View progress'
      if (key === 'chat.tools.outputs.retrieved') {
        return `Retrieved ${(values?.count as number | undefined) ?? 0} outputs`
      }
      if (key === 'chat.tools.preview.untitled') return 'Untitled video'
      if (key === 'chat.tools.status.statusReady') return 'Ready'
      if (key === 'chat.tools.status.statusFailed') return 'Failed'
      if (key === 'chat.tools.status.statusProcessing') return 'Processing'
      if (key === 'chat.tools.status.statusQueued') return 'Queued'
      return key
    },
    locale: 'en',
  }),
}))

describe('Chat Tools', () => {
  it('renders get_task_status header and latest status summary', () => {
    render(
      <GetTaskStatusTool
        toolCallId="1"
        state="output-available"
        input={{ taskId: 'task-1' }}
        output={{ taskId: 'task-1', status: 'processing' }}
      />
    )

    expect(screen.getByText('Task status')).toBeInTheDocument()
    expect(screen.getByText('Latest status: Processing')).toBeInTheDocument()
    expect(screen.getByText('taskId: task-1')).toBeInTheDocument()
  })

  it('renders get_task_status errors', () => {
    render(
      <GetTaskStatusTool
        toolCallId="1"
        state="output-error"
        errorText="Network error"
      />
    )

    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders create_task success and view action', () => {
    const onViewClick = vi.fn()

    render(
      <CreateTaskTool
        toolCallId="1"
        state="output-available"
        output={{ taskId: 'task-1', message: 'Created', videoUrl: 'http://video' }}
        onViewClick={onViewClick}
      />
    )

    expect(screen.getByText('Processing')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('http://video')).toBeInTheDocument()

    fireEvent.click(screen.getByText('View progress'))
    expect(onViewClick).toHaveBeenCalledWith('task-1')
  })

  it('renders create_task errors', () => {
    render(
      <CreateTaskTool
        toolCallId="1"
        state="output-available"
        output={{ error: 'Creation failed', details: 'Invalid URL' }}
      />
    )

    expect(screen.getByText('Creation failed')).toBeInTheDocument()
  })

  it('renders preview_video output', () => {
    render(
      <PreviewVideoTool
        toolCallId="1"
        state="output-available"
        output={{ title: 'Cool Video', duration: '10:00', channel: 'Test Channel' }}
      />
    )

    expect(screen.getByText('Video preview')).toBeInTheDocument()
    expect(screen.getByText('Cool Video')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('Test Channel')).toBeInTheDocument()
  })

  it('renders task outputs summary', () => {
    render(
      <GetTaskOutputsTool
        toolCallId="1"
        state="output-available"
        output={{
          taskId: 'task-1',
          count: 2,
          outputs: [
            { kind: 'summary', content: 'hello', status: 'completed' },
            { kind: 'script', content: 'world', status: 'completed' },
          ],
        }}
      />
    )

    expect(screen.getByText('Retrieved results')).toBeInTheDocument()
    expect(screen.getByText('Retrieved 2 outputs')).toBeInTheDocument()
    expect(screen.getByText('summary')).toBeInTheDocument()
    expect(screen.getByText('script')).toBeInTheDocument()
  })

  it('renders unknown tool badge and title', () => {
    render(
      <UnknownTool
        toolCallId="1"
        toolName="mystery_tool"
        state="input-available"
        input={{ foo: 'bar' }}
      />
    )

    expect(screen.getByText('mystery_tool')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
