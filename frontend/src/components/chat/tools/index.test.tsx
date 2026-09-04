import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  GetTaskOutputsTool,
  GetTaskStatusTool,
  UnknownTool,
} from './index'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'chat.tools.outputs.retrieved') {
        return `Retrieved ${(values?.count as number | undefined) ?? 0} outputs`
      }
      if (key === 'chat.tools.outputs.title') return 'Retrieved results'
      if (key === 'chat.tools.outputs.kinds.summary') return 'Summary'
      if (key === 'chat.tools.outputs.kinds.script') return 'Transcript'
      if (key === 'chat.tools.state.input-available') return 'Running'
      if (key === 'chat.tools.status.title') return 'Task status'
      if (key === 'chat.tools.status.latest') return `Latest status: ${values?.status}`
      if (key === 'chat.tools.status.taskId') return `Task ID: ${values?.id}`
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
    expect(screen.getByText('Task ID: task-1')).toBeInTheDocument()
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
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Transcript')).toBeInTheDocument()
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
