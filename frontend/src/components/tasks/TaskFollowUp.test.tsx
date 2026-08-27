import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TaskFollowUp } from './TaskFollowUp'

const replaceMock = vi.fn()
let mockIsAuthenticated: boolean | null = false
let mockThreadPayload = {
  messages: [] as Array<{ id: string; role: 'user' | 'assistant'; parts: Array<{ type: 'text'; text: string }> }>,
  taskId: null as string | null,
  isLoading: false,
  error: null as Error | null,
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/tasks/task-1/source-title',
  useRouter: () => ({ replace: replaceMock }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}))

vi.mock('@/hooks/useThreadPayload', () => ({
  useThreadPayload: () => mockThreadPayload,
}))

vi.mock('@/components/chat/ChatContainer', () => ({
  ChatContainer: (props: {
    activeTaskId?: string | null
    threadId?: string | null
    initialMessages?: unknown[]
    variant?: string
    allowDirectUrlSubmission?: boolean
    showTaskArtifacts?: boolean
    onChatStarted?: (threadId: string) => void
  }) => (
    <div
      data-testid="embedded-chat"
      data-task-id={props.activeTaskId ?? ''}
      data-thread-id={props.threadId ?? ''}
      data-message-count={String(props.initialMessages?.length ?? 0)}
      data-variant={props.variant}
      data-allow-direct-url={String(props.allowDirectUrlSubmission)}
      data-show-task-artifacts={String(props.showTaskArtifacts)}
    >
      <button
        type="button"
        onClick={() => props.onChatStarted?.('f47ac10b-58cc-4372-a567-0e02b2c3d479')}
      >
        Persist chat
      </button>
    </div>
  ),
}))

const copy = {
  title: '基于本期内容继续追问',
  restoring: '正在恢复最近的对话...',
  restoreFailed: '未能恢复之前的对话。',
}

const defaultProps = {
  taskId: 'task-1',
  taskStatus: 'completed' as const,
  videoTitle: 'A useful source',
  videoUrl: 'https://example.com/video',
  thumbnailUrl: 'https://example.com/cover.jpg',
  copy,
}

describe('TaskFollowUp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    replaceMock.mockReset()
    mockIsAuthenticated = false
    mockThreadPayload = {
      messages: [],
      taskId: null,
      isLoading: false,
      error: null,
    }
    window.history.replaceState({}, '', '/zh/tasks/task-1/source-title')
  })

  it('renders the source-bound composer inline for public readers', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')

    render(<TaskFollowUp {...defaultProps} />)

    expect(await screen.findByTestId('embedded-chat')).toHaveAttribute('data-variant', 'embedded')
    expect(screen.getByTestId('embedded-chat')).toHaveAttribute('data-task-id', 'task-1')
    expect(screen.getByTestId('embedded-chat')).toHaveAttribute('data-allow-direct-url', 'false')
    expect(screen.getByTestId('embedded-chat')).toHaveAttribute('data-show-task-artifacts', 'false')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores the latest task thread for an authenticated reader', async () => {
    mockIsAuthenticated = true
    mockThreadPayload = {
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'text', text: 'Previous question' }] }],
      taskId: 'task-1',
      isLoading: false,
      error: null,
    }
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }],
    } as Response)

    render(<TaskFollowUp {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('embedded-chat')).toHaveAttribute(
        'data-thread-id',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      )
    })
    expect(screen.getByTestId('embedded-chat')).toHaveAttribute('data-message-count', '1')
  })

  it('preserves the detail URL state when a new conversation is persisted', async () => {
    window.history.replaceState({}, '', '/zh/tasks/task-1/source-title?fromShow=latent-space')
    render(<TaskFollowUp {...defaultProps} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Persist chat' }))

    expect(replaceMock).toHaveBeenCalledWith(
      '/zh/tasks/task-1/source-title?fromShow=latent-space&threadId=f47ac10b-58cc-4372-a567-0e02b2c3d479',
      { scroll: false }
    )
  })

  it('keeps non-completed task status available inside the embedded surface', async () => {
    render(<TaskFollowUp {...defaultProps} taskStatus="failed" />)

    expect(await screen.findByTestId('embedded-chat')).toHaveAttribute('data-message-count', '1')
    expect(screen.getByTestId('embedded-chat')).toHaveAttribute('data-show-task-artifacts', 'true')
  })
})
