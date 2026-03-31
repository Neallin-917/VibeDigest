import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ChatContainer } from '../ChatContainer'
import type { UIMessage } from 'ai'

const mockUseChat = vi.fn()
const mockSendMessage = vi.fn()
const mockSetMessages = vi.fn()
const mockRegenerate = vi.fn()
const mockStop = vi.fn()

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
      {!isAuthenticated && <span data-testid="login-hint">sign-in-hint</span>}
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

  it('renders ChatInput and Messages when there are messages', () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }
    ]
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
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('sends message via ChatInput when authenticated', async () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Prev' }] }
    ]
    mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        sendMessage: mockSendMessage,
        status: 'idle',
    } as any)

    render(<ChatContainer isAuthenticated={true} />)
    fireEvent.click(screen.getByText('Send'))
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'test message' })
  })

  it('redirects to login when unauthenticated user sends a message', () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'Prev' }] }
    ]
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
    expect(mockSendMessage).toHaveBeenCalledWith({ text: 'welcome message' })
  })

  it('shows login hint in WelcomeScreen when unauthenticated', () => {
    render(<ChatContainer isAuthenticated={false} />)
    expect(screen.getByTestId('login-hint')).toBeInTheDocument()
  })

  it('renders pending/loading state', () => {
    const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    ]
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
    const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    ]
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
    const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    ]
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

  it('renders tool invocations correctly', () => {
    const messagesWithTools: any[] = [
        {
            id: '2',
            role: 'assistant',
            parts: [
                { type: 'tool-get_task_status', toolCallId: '1', state: 'result', args: {}, output: {} },
                { type: 'tool-get_task_outputs', toolCallId: '2', state: 'result', args: {}, output: {} },
                { type: 'tool-create_task', toolCallId: '3', state: 'result', args: {}, output: { taskId: 't1', videoUrl: 'url' } },
                { type: 'tool-foo', toolCallId: '4', state: 'result', args: {}, output: {} },
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
    
    expect(screen.getByTestId('tool-get-task-status')).toBeInTheDocument()
    expect(screen.getByTestId('tool-get-task-outputs')).toBeInTheDocument()
    expect(screen.getAllByTestId('tool-get-task-status')).toHaveLength(1) 
    expect(screen.getByTestId('tool-unknown')).toBeInTheDocument()
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
                    state: 'result', 
                    args: {}, 
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
        expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Stored Message' })
    })
    expect(localStorage.getItem('vibedigest_pending_message')).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Cycle 3: AnimatePresence removal — message rendering performance tests
  // -----------------------------------------------------------------------
  describe('message rendering performance', () => {
    it('renders all history messages without AnimatePresence wrapper', () => {
      const messages: UIMessage[] = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: `Message ${i}` }],
      }))
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
      const historyMessages: UIMessage[] = [
        { id: 'h1', role: 'user', parts: [{ type: 'text', text: 'User says hi' }] },
        { id: 'h2', role: 'assistant', parts: [{ type: 'text', text: 'Assistant replies' }] },
        { id: 's1', role: 'assistant', parts: [{ type: 'text', text: 'Streaming...' }] },
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
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] } as UIMessage
        ]
      })
      expect(prepared?.body?.taskId).toBe('task-2')
    })
  })

  it('does not re-hydrate messages when initialMessages already match chat state', () => {
    const initialMessages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
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
    const currentMessages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Old' }] },
    ]
    const nextInitialMessages: UIMessage[] = [
      { id: 'm9', role: 'user', parts: [{ type: 'text', text: 'New thread' }] },
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
    const messages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }
    ]

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
})
