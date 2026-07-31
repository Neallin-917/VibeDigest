import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ChatContainer } from '../ChatContainer'
import type { ChatUIMessage } from '@/lib/chat-ui'

const mockUseChat = vi.fn()
const mockSendMessage = vi.fn()
const mockSetMessages = vi.fn()
const mockRegenerate = vi.fn()
const mockStop = vi.fn()

function createTextMessage(
  text: string,
  role: ChatUIMessage['role'] = 'user',
  id = `${role}-${Math.random().toString(36).slice(2, 10)}`
): ChatUIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  }
}

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: any) => {
    if (options?.onFinish) {
        (global as any).mockOnChatFinish = options.onFinish
    }
    return mockUseChat(options)
  },
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === 'auth.signInToContinue') return 'Sign in to continue to VibeDigest'
      if (key === 'auth.signIn') return 'Sign In'
      if (key === 'brand.appName') return 'VibeDigest'
      if (key === 'chat.thinking') return 'Thinking...'
      if (key === 'chat.genericError') return 'Something went wrong.'
      if (key === 'chat.retry') return 'Retry'
      return key
    },
    locale: 'en',
  }),
}))

vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSubmit, isLoading, disabled }: any) => (
    <div data-testid="chat-input">
      <button onClick={() => onSubmit('test message')} disabled={isLoading || disabled}>Send</button>
    </div>
  )
}))

vi.mock('../WelcomeScreen', () => ({
  WelcomeScreen: ({ onSubmit, isAuthenticated }: any) => (
    <div data-testid="welcome-screen">
      <button onClick={() => onSubmit('welcome message')}>Start</button>
      {isAuthenticated === false && <span data-testid="login-hint">sign-in-hint</span>}
    </div>
  )
}))

vi.mock('../tools', () => ({
  GetTaskStatusTool: () => <div data-testid="tool-get-task-status" />,
  CreateTaskTool: () => <div data-testid="tool-create-task" />,
  GetTaskOutputsTool: () => <div data-testid="tool-get-task-outputs" />,
  UnknownTool: () => <div data-testid="tool-unknown" />,
  PreviewVideoTool: () => <div data-testid="tool-preview-video" />,
}))

describe('ChatContainer', () => {
  beforeEach(() => {
    mockUseChat.mockReset()
    mockUseChat.mockReturnValue({
      messages: [],
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    })
    
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders WelcomeScreen when there are no messages', () => {
    render(<ChatContainer />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
  })

  it('renders ChatInput and lazily loads messages when there are messages', async () => {
    const messages: ChatUIMessage[] = [createTextMessage('Hello', 'user', '1')]
    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
    } as any)

    render(<ChatContainer />)
    expect(screen.queryByTestId('welcome-screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })

  it('sends message via ChatInput when authenticated', async () => {
    const messages: ChatUIMessage[] = [createTextMessage('Prev', 'user', '1')]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        status: 'idle',
    } as any)

    render(<ChatContainer isAuthenticated={true} />)
    fireEvent.click(screen.getByText('Send'))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'test message' }],
      })
    )
  })

  it('redirects to login when an unauthenticated user sends a message', () => {
    const messages: ChatUIMessage[] = [createTextMessage('Prev', 'user', '1')]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        status: 'idle',
    } as any)

    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: '' },
      writable: true,
    })

    render(<ChatContainer isAuthenticated={false} />)
    fireEvent.click(screen.getByText('Send'))

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(localStorage.getItem('vibedigest_pending_message')).toBe('test message')
    expect(window.location.href).toMatch(/\/login/)

    window.location.href = originalHref
    localStorage.clear()
  })

  it('sends message via WelcomeScreen when authenticated', async () => {
    render(<ChatContainer isAuthenticated={true} />)
    fireEvent.click(screen.getByText('Start'))
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'welcome message' }],
      })
    )
  })

  it('shows login hint in WelcomeScreen when unauthenticated', () => {
    render(<ChatContainer isAuthenticated={false} />)
    expect(screen.getByTestId('login-hint')).toBeInTheDocument()
  })

  it('renders pending/loading state', () => {
    const messages: ChatUIMessage[] = [createTextMessage('Hi', 'user', '1')]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        status: 'submitted',
        sendMessage: mockSendMessage,
    } as any)

    render(<ChatContainer />)
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
  })

  it('handles auth error', () => {
    const authError = { status: 401 }
    const messages: ChatUIMessage[] = [createTextMessage('Hi', 'user', '1')]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        status: 'idle',
        error: authError,
        sendMessage: mockSendMessage,
    } as any)

    render(<ChatContainer />)
    expect(screen.getByText('Sign in to continue to VibeDigest')).toBeInTheDocument()
  })

  it('handles generic error', () => {
    const genericError = new Error('Random error')
    const messages: ChatUIMessage[] = [createTextMessage('Hi', 'user', '1')]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        status: 'idle',
        error: genericError,
        regenerate: mockRegenerate,
        sendMessage: mockSendMessage,
    } as any)

    render(<ChatContainer />)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(mockRegenerate).toHaveBeenCalled()
  })

  it('renders tool invocations correctly', async () => {
    const messagesWithTools: any[] = [
        {
            id: '2',
            role: 'assistant',
            parts: [
                { type: 'tool-get_task_status', toolCallId: '1', state: 'output-available', input: {}, output: {} },
                { type: 'tool-get_task_outputs', toolCallId: '2', state: 'output-available', input: {}, output: {} },
                { type: 'tool-create_task', toolCallId: '3', state: 'output-available', input: {}, output: { taskId: 't1', videoUrl: 'url' } },
                { type: 'tool-foo', toolCallId: '4', state: 'output-available', input: {}, output: {} },
            ]
        }
    ]

    mockUseChat.mockReturnValue({
        messages: messagesWithTools,
        setMessages: mockSetMessages,
        status: 'idle',
        sendMessage: mockSendMessage,
    } as any)

    render(<ChatContainer />)
    
    expect(await screen.findByTestId('tool-get-task-outputs')).toBeInTheDocument()
    expect(await screen.findByTestId('tool-unknown')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-get-task-status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tool-create-task')).not.toBeInTheDocument()
  })

  it('triggers onOpenPanel when create_task completes', async () => {
    const onOpenPanel = vi.fn()
    const messages: any[] = [
        {
            id: '2',
            role: 'assistant',
            parts: [
                { 
                    type: 'tool-create_task', 
                    toolCallId: '3', 
                    state: 'output-available', 
                    input: {}, 
                    output: { taskId: 'new-task-id', videoUrl: 'url' } 
                }
            ]
        }
    ]

    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        status: 'idle',
        sendMessage: mockSendMessage,
    } as any)

    render(<ChatContainer onOpenPanel={onOpenPanel} />)
    
    await waitFor(() => {
        expect(onOpenPanel).toHaveBeenCalledWith('new-task-id')
    })
  })

  it('handles pending message from localStorage when authenticated', async () => {
    localStorage.setItem('vibedigest_pending_message', 'Stored Message')

    render(<ChatContainer isAuthenticated={true} />)

    await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'user',
            parts: [{ type: 'text', text: 'Stored Message' }],
          })
        )
    })
    expect(localStorage.getItem('vibedigest_pending_message')).toBeNull()
  })

  it('waits for account resolution before handling a pending message', async () => {
    localStorage.setItem('vibedigest_pending_message', 'Stored Message')

    const { rerender } = render(<ChatContainer isAuthenticated={null} />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(localStorage.getItem('vibedigest_pending_message')).toBe('Stored Message')

    rerender(<ChatContainer isAuthenticated={true} />)

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          parts: [{ type: 'text', text: 'Stored Message' }],
        })
      )
    })
    expect(localStorage.getItem('vibedigest_pending_message')).toBeNull()
  })

  it('hydrates direct URL submissions from server-provided data parts', async () => {
    localStorage.setItem('vibedigest_pending_message', 'https://www.youtube.com/watch?v=test123')
    const originalFetch = global.fetch
    try {
      const serverMessages: ChatUIMessage[] = [
        {
          id: 'direct-user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=test123' }],
        },
        {
          id: 'direct-assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'data-task-status',
              id: 'task-status-task-123',
              data: { taskId: 'task-123', status: 'pending', progress: 0 },
            } as any,
            {
              type: 'data-task-progress',
              id: 'task-progress-task-123',
              data: { taskId: 'task-123' },
            } as any,
            {
              type: 'data-task-plan',
              id: 'task-plan-task-123',
              data: { taskId: 'task-123' },
            } as any,
          ],
        },
      ]

      ;(global as typeof globalThis).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ task_id: 'task-123', messages: serverMessages }),
      } as Response)

      render(<ChatContainer isAuthenticated={true} />)

      await waitFor(() => {
        expect(mockSetMessages).toHaveBeenCalledTimes(1)
      })

      const updater = mockSetMessages.mock.calls[0][0]
      expect(typeof updater).toBe('function')

      const nextMessages = updater([]) as ChatUIMessage[]
      expect(nextMessages).toEqual(serverMessages)
      expect(mockSendMessage).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('shows a direct-submit error and does not fall back to the chat transport', async () => {
    localStorage.setItem('vibedigest_pending_message', 'https://www.youtube.com/watch?v=broken123')
    const originalFetch = global.fetch
    try {
      ;(global as typeof globalThis).fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'Task creation failed',
          details: 'backend is down',
        }),
      } as Response)

      render(<ChatContainer isAuthenticated={true} />)

      await waitFor(() => {
        expect(screen.getByText('backend is down')).toBeInTheDocument()
      })

      expect(mockSendMessage).not.toHaveBeenCalled()
      expect(mockSetMessages).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
    }
  })

  // -----------------------------------------------------------------------
  // Cycle 3: AnimatePresence removal — message rendering performance tests
  // -----------------------------------------------------------------------
  describe('message rendering performance', () => {
    it('renders all history messages without AnimatePresence wrapper', () => {
      const messages: ChatUIMessage[] = Array.from({ length: 5 }, (_, i) =>
        createTextMessage(`Message ${i}`, 'user', `msg-${i}`)
      )
      mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        status: 'idle',
        error: null,
      } as any)

      const { container } = render(<ChatContainer />)
      // All 5 messages should be rendered
      for (let i = 0; i < 5; i++) {
        expect(screen.getByText(`Message ${i}`)).toBeInTheDocument()
      }
      // No element should have data-streaming="true" (history messages)
      const streamingElems = container.querySelectorAll('[data-streaming="true"]')
      expect(streamingElems).toHaveLength(0)
    })

    it('renders streaming message separately from history', () => {
      const historyMessages: ChatUIMessage[] = [
        createTextMessage('User says hi', 'user', 'h1'),
        createTextMessage('Assistant replies', 'assistant', 'h2'),
        createTextMessage('Streaming...', 'assistant', 's1'),
      ]
      mockUseChat.mockReturnValue({
        messages: historyMessages,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        status: 'streaming',
        error: null,
      } as any)

      const { container } = render(<ChatContainer />)
      // History messages should be present
      expect(screen.getByText('User says hi')).toBeInTheDocument()
      expect(screen.getByText('Assistant replies')).toBeInTheDocument()
      // Streaming message should be marked as streaming
      const streamingElems = container.querySelectorAll('[data-streaming="true"]')
      expect(streamingElems.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('uses latest activeTaskId when preparing request after task switch', async () => {
    mockUseChat.mockReturnValue({
      messages: [],
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    })

    const { rerender } = render(<ChatContainer activeTaskId="task-1" />)

    const firstOptions = mockUseChat.mock.calls[0]?.[0]
    const prepare = firstOptions?.transport?.prepareSendMessagesRequest
    expect(typeof prepare).toBe('function')

    rerender(<ChatContainer activeTaskId="task-2" />)

    await waitFor(() => {
      const prepared = prepare({
        messages: [
          createTextMessage('hello', 'user', 'm1')
        ]
      })
      expect(prepared?.body?.taskId).toBe('task-2')
    })
  })

  it('does not re-hydrate messages when initialMessages already match chat state', () => {
    const initialMessages: ChatUIMessage[] = [
      createTextMessage('Hello', 'user', 'm1'),
      createTextMessage('Hi', 'assistant', 'm2'),
    ]

    mockUseChat.mockReturnValue({
      messages: initialMessages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer initialMessages={initialMessages} />)

    expect(mockSetMessages).not.toHaveBeenCalled()
  })

  it('hydrates messages when initialMessages change to a different thread history', () => {
    const currentMessages: ChatUIMessage[] = [
      createTextMessage('Old', 'user', 'm1'),
    ]
    const nextInitialMessages: ChatUIMessage[] = [
      createTextMessage('New thread', 'user', 'm9'),
    ]

    mockUseChat.mockReturnValue({
      messages: currentMessages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer initialMessages={nextInitialMessages} />)

    expect(mockSetMessages).toHaveBeenCalledWith(nextInitialMessages)
  })

  it('locks the composer while thread switching is in progress', () => {
    const messages: ChatUIMessage[] = [createTextMessage('Hello', 'user', 'm1')]

    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer initialMessages={messages} isInteractionLocked={true} />)

    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('does not show speculative queued progress while a task-linked chat is opening', () => {
    render(
      <ChatContainer
        activeTaskId="completed-demo-task"
        isInteractionLocked={true}
      />
    )

    expect(screen.queryByText('chat.tools.status.videoTask')).not.toBeInTheDocument()
  })

  it('keeps standalone live progress for a newly submitted task', () => {
    render(
      <ChatContainer
        activeTaskId="new-task"
        isInteractionLocked={false}
      />
    )

    expect(screen.getByText('chat.tools.status.videoTask')).toBeInTheDocument()
  })
})
