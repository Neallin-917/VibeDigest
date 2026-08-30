import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ChatContainer } from '../ChatContainer'
import type { ChatUIMessage } from '@/lib/chat-ui'

const mockUseChat = vi.fn()
const mockSendMessage = vi.fn()
const mockSetMessages = vi.fn()
const mockRegenerate = vi.fn()
const mockStop = vi.fn()
const mockUseChatRealtime = vi.fn()
let mockChatInputText = 'test message'
let mockLocale: 'en' | 'zh' | 'ja' = 'en'

const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))
const navigation = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('@/lib/growth-events', () => growth)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}))

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

vi.mock('../useChatRealtime', () => ({
  useChatRealtime: (options: unknown) => mockUseChatRealtime(options),
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
      if (key === 'taskForm.quotaExceeded.description') return {
        en: 'Your plan limit has been reached.',
        zh: '您的方案额度已用完。',
        ja: 'プランの利用上限に達しました。',
      }[mockLocale]
      if (key === 'taskForm.quotaExceeded.confirm') return {
        en: 'View Plans',
        zh: '查看方案',
        ja: 'プランを見る',
      }[mockLocale]
      if (key === 'chat.followUpPlaceholder') return 'Ask a follow-up about this source...'
      if (key === 'chat.followUpInputLabel') return 'Follow-up question about this source'
      return key
    },
    locale: mockLocale,
  }),
}))

vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSubmit, onStop, isLoading, disabled, placeholder, inputLabel, variant, hideDisclaimer }: any) => (
    <div
      data-testid="chat-input"
      data-placeholder={placeholder}
      data-label={inputLabel}
      data-variant={variant}
      data-hide-disclaimer={String(Boolean(hideDisclaimer))}
    >
      <button onClick={() => onSubmit(mockChatInputText)} disabled={isLoading || disabled}>Send</button>
      {onStop && <button onClick={onStop}>Stop response</button>}
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

vi.mock('../ProcessingIndicator', () => ({
  ProcessingIndicator: ({ label }: { label: string }) => (
    <div data-testid="processing-indicator" role="status" aria-live="polite">{label}</div>
  ),
}))

vi.mock('../tools', () => ({
  GetTaskStatusTool: () => <div data-testid="tool-get-task-status" />,
  GetTaskOutputsTool: () => <div data-testid="tool-get-task-outputs" />,
  UnknownTool: () => <div data-testid="tool-unknown" />,
}))

describe('ChatContainer', () => {
  beforeEach(() => {
    growth.trackGrowthEvent.mockReset()
    navigation.push.mockReset()
    mockRegenerate.mockReset().mockResolvedValue(undefined)
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
    mockChatInputText = 'test message'
    mockLocale = 'en'
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('renders WelcomeScreen when there are no messages', () => {
    render(<ChatContainer />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
  })

  it('keeps the welcome surface visible while a selected task has no messages yet', () => {
    render(<ChatContainer activeTaskId="selected-task" />)

    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument()
  })

  it('renders an inline follow-up composer without the welcome surface in embedded mode', () => {
    render(<ChatContainer activeTaskId="selected-task" variant="embedded" />)

    expect(screen.queryByTestId('welcome-screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-variant', 'inline')
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-hide-disclaimer', 'true')
  })

  it('treats URLs as source questions instead of new submissions in embedded mode', () => {
    mockChatInputText = 'What does https://example.com add to this argument?'

    render(
      <ChatContainer
        activeTaskId="selected-task"
        variant="embedded"
        scope="source"
        isAuthenticated={true}
      />
    )

    fireEvent.click(screen.getByText('Send'))

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: mockChatInputText }],
      })
    )
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

  it('frames the composer as a source-grounded follow-up when a task is active', () => {
    const messages: ChatUIMessage[] = [createTextMessage('A completed result', 'assistant', 'result-1')]
    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer activeTaskId="task-123" />)

    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-placeholder',
      'Ask a follow-up about this source...'
    )
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-label',
      'Follow-up question about this source'
    )
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

    render(<ChatContainer isAuthenticated={false} />)
    fireEvent.click(screen.getByText('Send'))

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(localStorage.getItem('vibedigest_pending_message')).toBe('test message')
    expect(navigation.push).toHaveBeenCalledWith(
      `/en/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
    )

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
    expect(screen.getByTestId('processing-indicator')).toHaveAttribute('aria-live', 'polite')
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

  it.each([
    {
      locale: 'en',
      scope: 'workspace',
      transportError: new Error('{"error":"The task allowance has been reached.","code":"quota_exceeded"}'),
      description: 'Your plan limit has been reached.',
      confirm: 'View Plans',
      surface: 'workspace',
    },
    {
      locale: 'ja',
      scope: 'source',
      transportError: new Error('VIBEDIGEST_QUOTA_EXCEEDED'),
      description: 'プランの利用上限に達しました。',
      confirm: 'プランを見る',
      surface: 'source_followup',
    },
  ] as const)(
    'shows the localized quota CTA for $scope without offering Retry',
    ({ locale, scope, transportError, description, confirm, surface }) => {
      mockLocale = locale
      const messages: ChatUIMessage[] = [createTextMessage('Hi', 'user', '1')]
      mockUseChat.mockReturnValue({
        messages,
        setMessages: mockSetMessages,
        status: 'idle',
        error: transportError,
        regenerate: mockRegenerate,
        sendMessage: mockSendMessage,
        stop: mockStop,
      } as any)

      render(<ChatContainer scope={scope} />)

      expect(screen.getByRole('alert')).toHaveTextContent(description)
      const cta = screen.getByRole('link', { name: confirm })
      expect(cta).toHaveAttribute('href', `/${locale}/settings/pricing`)
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

      cta.addEventListener('click', event => event.preventDefault(), { once: true })
      fireEvent.click(cta)

      expect(growth.trackGrowthEvent).toHaveBeenCalledExactlyOnceWith('quota_pricing_open', {
        locale,
        surface,
      })
      expect(mockRegenerate).not.toHaveBeenCalled()
    },
  )

  it('restores the quota CTA from persisted metadata without rendering stale retry UI', () => {
    const messages: ChatUIMessage[] = [
      createTextMessage('Process this video', 'user', 'user-quota'),
      {
        ...createTextMessage('Persisted quota marker', 'assistant', 'assistant-quota'),
        metadata: {
          agentTurnId: 'turn-quota', agentState: 'failed', errorCode: 'quota_exceeded',
        },
      },
    ]
    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      sendMessage: mockSendMessage,
      stop: mockStop,
    })

    render(<ChatContainer initialMessages={messages} threadId="thread-quota" isAuthenticated />)

    expect(screen.queryByText('Persisted quota marker')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your plan limit has been reached.')
    expect(screen.getByRole('link', { name: 'View Plans' })).toHaveAttribute('href', '/en/settings/pricing')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry answer' })).not.toBeInTheDocument()
    expect(mockRegenerate).not.toHaveBeenCalled()
  })

  it('renders tool invocations correctly', async () => {
    const messagesWithTools: any[] = [
        {
            id: '2',
            role: 'assistant',
            parts: [
                { type: 'tool-get_task_status', toolCallId: '1', state: 'output-available', input: {}, output: {} },
                { type: 'tool-get_task_outputs', toolCallId: '2', state: 'output-available', input: {}, output: {} },
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

  it('sends a pending URL through the Agent without a direct-submit request', async () => {
    localStorage.setItem('vibedigest_pending_message', 'https://www.youtube.com/watch?v=test123')
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<ChatContainer isAuthenticated={true} />)

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=test123' }],
    })))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockSetMessages).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it.each([
    { scope: 'workspace', surface: 'workspace' },
    { scope: 'source', surface: 'source_followup' },
  ] as const)('tracks task creation acceptance once for a new %s task', ({ scope, surface }) => {
    const onChatStarted = vi.fn()
    render(<ChatContainer scope={scope} onChatStarted={onChatStarted} />)

    act(() => {
      ;(global as any).mockOnChatFinish?.({
        messages: [{
          id: 'assistant-task-created',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Created.' },
            { type: 'data-task-status', data: { taskId: 'task-new-1' } },
          ],
        }],
        isAbort: false,
        isDisconnect: false,
        isError: false,
      })
    })

    expect(growth.trackGrowthEvent).toHaveBeenCalledWith('task_create_accepted', {
      locale: 'en',
      surface,
    })
    expect(onChatStarted).toHaveBeenCalledWith(expect.any(String), 'task-new-1')
  })

  it('does not track task creation acceptance for an existing task follow-up', () => {
    const onChatStarted = vi.fn()
    render(<ChatContainer activeTaskId="task-existing" scope="source" onChatStarted={onChatStarted} />)

    act(() => {
      ;(global as any).mockOnChatFinish?.({
        messages: [{
          id: 'assistant-followup',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Follow-up answer.' },
            { type: 'data-task-status', data: { taskId: 'task-existing' } },
          ],
        }],
        isAbort: false,
        isDisconnect: false,
        isError: false,
      })
    })

    expect(growth.trackGrowthEvent).not.toHaveBeenCalledWith('task_create_accepted', expect.anything())
    expect(onChatStarted).toHaveBeenCalledWith(expect.any(String), 'task-existing')
  })

  it.each([
    'https://www.youtube.com/watch?v=new123',
    'Do not process https://www.youtube.com/watch?v=new123 yet; explain the options.',
    'What does https://example.com mean in this source?',
  ])('leaves URL intent decisions to the Agent: %s', text => {
    mockChatInputText = text
    render(<ChatContainer isAuthenticated={true} variant="embedded" />)
    fireEvent.click(screen.getByText('Send'))
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user', parts: [{ type: 'text', text }],
    }))
  })

  it.each(['workspace', 'source'] as const)('sends the explicit %s scope and latest user message during regeneration', scope => {
    render(<ChatContainer scope={scope} threadId="thread-1" activeTaskId="task-1" />)
    const prepare = mockUseChat.mock.calls[0][0].transport.prepareSendMessagesRequest
    const userMessage = createTextMessage('Latest question', 'user', 'user-latest')
    const result = prepare({
      trigger: 'regenerate-message',
      messages: [
        createTextMessage('Older question', 'user', 'user-old'),
        userMessage,
        createTextMessage('Incomplete assistant response', 'assistant', 'assistant-latest'),
      ],
    })
    expect(result.body).toEqual({
      message: userMessage, threadId: 'thread-1', taskId: 'task-1', locale: 'en', scope,
    })
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
      expect(prepared?.body?.locale).toBe('en')
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

  it('delegates initial history and streaming state to the non-destructive realtime merger', () => {
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
      status: 'streaming',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer threadId="thread-1" initialMessages={nextInitialMessages} isAuthenticated />)

    expect(mockUseChatRealtime).toHaveBeenLastCalledWith({
      threadId: 'thread-1', enabled: true, status: 'streaming', messages: currentMessages,
      initialMessages: nextInitialMessages, setMessages: mockSetMessages,
    })
    expect(mockSetMessages).not.toHaveBeenCalled()
  })

  it('uses the newest confirmed task reference after a completed Agent response', () => {
    const onChatStarted = vi.fn()
    render(<ChatContainer threadId="thread-1" activeTaskId="old-task" onChatStarted={onChatStarted} />)
    const chatOptions = mockUseChat.mock.calls[0][0]
    const messages: ChatUIMessage[] = [{
      id: 'assistant-created-task', role: 'assistant',
      parts: [
        { type: 'data-task-status', data: { taskId: 'old-task', status: 'completed' } },
        { type: 'data-task-status', data: { taskId: 'new-task', status: 'pending' } },
      ],
    }]
    chatOptions.onFinish({ messages, isAbort: false, isError: false, isDisconnect: false })
    expect(onChatStarted).toHaveBeenCalledWith('thread-1', 'new-task')
    expect(chatOptions.transport.prepareSendMessagesRequest({
      messages: [createTextMessage('Follow up', 'user', 'next-user')],
    }).body.taskId).toBe('new-task')
  })

  it.each(['isAbort', 'isError', 'isDisconnect'])('does not report a persisted chat after %s', flag => {
    const onChatStarted = vi.fn()
    render(<ChatContainer onChatStarted={onChatStarted} />)
    mockUseChat.mock.calls[0][0].onFinish({ messages: [], [flag]: true })
    expect(onChatStarted).not.toHaveBeenCalled()
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

  it('does not invent task progress from an active task id alone', () => {
    render(
      <ChatContainer
        activeTaskId="completed-demo-task"
      />
    )

    expect(screen.queryByText('chat.tools.status.videoTask')).not.toBeInTheDocument()
  })

  it('renders an inline task artifact from persisted task data', async () => {
    const messages: ChatUIMessage[] = [{
      id: 'assistant-inline-task',
      role: 'assistant',
      parts: [
        {
          type: 'data-task-status',
          id: 'task-status-new-task',
          data: {
            taskId: 'new-task',
            status: 'pending',
            progress: 0,
            videoUrl: 'https://www.youtube.com/watch?v=new-task',
          },
        } as any,
      ],
    }]

    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(<ChatContainer activeTaskId="new-task" />)

    expect(await screen.findByTestId('inline-task-artifact')).toBeInTheDocument()
  })

  it('hides duplicated task artifacts when the source is rendered by the detail page', () => {
    const messages: ChatUIMessage[] = [{
      id: 'assistant-inline-task',
      role: 'assistant',
      parts: [
        {
          type: 'data-task-status',
          id: 'task-status-existing-task',
          data: {
            taskId: 'existing-task',
            status: 'completed',
            progress: 100,
            videoUrl: 'https://www.youtube.com/watch?v=existing-task',
          },
        } as any,
      ],
    }]

    mockUseChat.mockReturnValue({
      messages,
      setMessages: mockSetMessages,
      sendMessage: mockSendMessage,
      status: 'idle',
      error: null,
      regenerate: mockRegenerate,
      stop: mockStop,
    } as any)

    render(
      <ChatContainer
        activeTaskId="existing-task"
        variant="embedded"
        showTaskArtifacts={false}
      />
    )

    expect(screen.queryByTestId('inline-task-artifact')).not.toBeInTheDocument()
  })

  it('renders only the latest status card when history repeats the same task', async () => {
    const taskParts = [
      {
        type: 'data-task-status',
        id: 'task-status-repeated-task',
        data: {
          taskId: 'repeated-task',
          status: 'pending',
          progress: 0,
          videoUrl: 'https://www.youtube.com/watch?v=repeated-task',
        },
      },
    ] as ChatUIMessage['parts']
    const messages: ChatUIMessage[] = [
      { id: 'assistant-old', role: 'assistant', parts: taskParts },
      createTextMessage('retry the same URL', 'user', 'user-retry'),
      { id: 'assistant-latest', role: 'assistant', parts: taskParts },
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

    render(<ChatContainer activeTaskId="repeated-task" />)

    expect(await screen.findAllByTestId('inline-task-artifact')).toHaveLength(1)
  })

  describe('durable answer continuation', () => {
    function continuationMessages(state: NonNullable<ChatUIMessage['metadata']>['agentState']): ChatUIMessage[] {
      return [
        createTextMessage('Explain the business model', 'user', 'original-user-id'),
        {
          ...createTextMessage('Your video has been accepted.', 'assistant', 'continuation-assistant'),
          metadata: { agentTurnId: 'turn-123', agentState: state },
        },
      ]
    }

    function configureMessages(messages: ChatUIMessage[], status = 'ready') {
      mockUseChat.mockReturnValue({
        messages, status, setMessages: mockSetMessages, sendMessage: mockSendMessage,
        error: null, regenerate: mockRegenerate, stop: mockStop,
      })
    }

    it.each([
      ['waiting_task', 'Your answer will continue when the video is ready.'],
      ['finalizing', 'Preparing your answer.'],
    ] as const)('restores %s feedback and cancellation from persisted message metadata', (state, label) => {
      const messages = continuationMessages(state)
      configureMessages(messages)
      render(<ChatContainer initialMessages={messages} threadId="thread-123" isAuthenticated />)
      expect(screen.getByText(label)).toHaveAttribute('role', 'status')
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Retry answer' })).not.toBeInTheDocument()
    })

    it('retries a failed answer with the same user ID and never reprocesses the video', async () => {
      const messages = continuationMessages('failed')
      configureMessages(messages)
      const fetchSpy = vi.spyOn(global, 'fetch')
      let replayedMessage: ChatUIMessage | undefined
      mockRegenerate.mockImplementation(async () => {
        const options = mockUseChat.mock.calls[0][0]
        replayedMessage = options.transport.prepareSendMessagesRequest({
          trigger: 'regenerate-message', messages,
        }).body.message
      })

      render(<ChatContainer initialMessages={messages} threadId="thread-123" activeTaskId="existing-video" isAuthenticated />)
      expect(screen.getByText('The answer could not finish.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry answer' }))
      await waitFor(() => expect(mockRegenerate).toHaveBeenCalledOnce())
      expect(replayedMessage).toEqual(messages[0])
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('posts cancellation without a body or token and only acknowledges a committed answer cancellation', async () => {
      const messages = continuationMessages('waiting_task')
      configureMessages(messages)
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ cancelled: true }),
      } as Response)
      render(<ChatContainer initialMessages={messages} threadId="thread-123" isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel answer' }))

      expect(await screen.findByText('Follow-up answer cancelled. Video processing is unchanged.')).toBeInTheDocument()
      expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('/api/chat/turns/turn-123/cancel', { method: 'POST' })
      expect(screen.queryByRole('button', { name: 'Cancel answer' })).not.toBeInTheDocument()
      expect(mockStop).not.toHaveBeenCalled()
      expect(mockSetMessages).not.toHaveBeenCalled()
      expect(screen.queryByText(/video (?:processing )?(?:was |is )?cancelled/i)).not.toBeInTheDocument()
    })

    it('does not claim cancellation when the server reports the answer already terminal', async () => {
      configureMessages(continuationMessages('finalizing'))
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ cancelled: false }) } as Response)
      render(<ChatContainer isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel answer' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel answer' })).not.toBeInTheDocument())
      expect(screen.queryByText('Follow-up answer cancelled. Video processing is unchanged.')).not.toBeInTheDocument()
      expect(screen.queryByText('Preparing your answer.')).not.toBeInTheDocument()
    })

    it.each(['http', 'network', 'invalid-response'])('keeps cancellation retryable after a safe %s failure', async failure => {
      configureMessages(continuationMessages('waiting_task'))
      const fetchSpy = vi.spyOn(global, 'fetch')
      if (failure === 'network') fetchSpy.mockRejectedValue(new Error('PRIVATE_TOKEN=do-not-display'))
      else fetchSpy.mockResolvedValue({
        ok: failure !== 'http',
        json: async () => ({ privateError: 'PRIVATE_TOKEN=do-not-display' }),
      } as Response)
      render(<ChatContainer isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel answer' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not cancel the answer. Please try again.')
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toBeEnabled()
      expect(screen.queryByText(/PRIVATE_TOKEN/)).not.toBeInTheDocument()
      expect(screen.queryByText('Follow-up answer cancelled. Video processing is unchanged.')).not.toBeInTheDocument()
    })

    it('prevents duplicate cancellation while the request is pending', async () => {
      configureMessages(continuationMessages('waiting_task'))
      let complete!: (response: Response) => void
      const pending = new Promise<Response>(resolve => { complete = resolve })
      const fetchSpy = vi.spyOn(global, 'fetch').mockReturnValue(pending)
      render(<ChatContainer isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel answer' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel answer' }))
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toHaveAttribute('aria-busy', 'true')
      expect(fetchSpy).toHaveBeenCalledOnce()
      await act(async () => complete({ ok: true, json: async () => ({ cancelled: true }) } as Response))
    })

    it.each([
      ['waiting_task', 'Cancel answer'],
      ['failed', 'Retry answer'],
    ] as const)('disables %s actions while interaction is locked or foreground generation is busy', (state, label) => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      configureMessages(continuationMessages(state))
      const { rerender } = render(<ChatContainer isAuthenticated isInteractionLocked />)
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: label }))
      for (const status of ['submitted', 'streaming']) {
        configureMessages(continuationMessages(state), status)
        rerender(<ChatContainer isAuthenticated />)
        expect(screen.getByRole('button', { name: label })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: label }))
      }
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(mockRegenerate).not.toHaveBeenCalled()
    })

    it('requires resolved authentication for durable actions', () => {
      configureMessages(continuationMessages('waiting_task'))
      const { rerender } = render(<ChatContainer isAuthenticated={null} />)
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toBeDisabled()
      rerender(<ChatContainer isAuthenticated={false} />)
      expect(screen.getByRole('button', { name: 'Cancel answer' })).toBeDisabled()
    })

    it('reports a retry failure safely without creating a new message', async () => {
      configureMessages(continuationMessages('failed'))
      mockRegenerate.mockRejectedValue(new Error('PRIVATE_RESPONSE=do-not-display'))
      render(<ChatContainer isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry answer' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not retry the answer. Please try again.')
      expect(screen.getByRole('button', { name: 'Retry answer' })).toBeEnabled()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('restores a cancelled answer without implying that video processing was cancelled', () => {
      const messages = continuationMessages('cancelled')
      configureMessages(messages)
      render(<ChatContainer initialMessages={messages} isAuthenticated />)
      expect(screen.getByText('Follow-up answer cancelled. Video processing is unchanged.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel answer' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry answer' })).not.toBeInTheDocument()
    })

    it.each(['failed', 'cancelled', 'waiting_task'] as const)('does not show an older %s state after a newer completed answer', oldState => {
      configureMessages([
        ...continuationMessages(oldState),
        {
          ...createTextMessage('The new answer is complete.', 'assistant', 'new-assistant'),
          metadata: { agentTurnId: 'new-turn', agentState: 'completed' },
        },
      ])
      render(<ChatContainer isAuthenticated />)
      expect(screen.queryByRole('button', { name: 'Cancel answer' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry answer' })).not.toBeInTheDocument()
      expect(screen.queryByText('Follow-up answer cancelled. Video processing is unchanged.')).not.toBeInTheDocument()
      expect(screen.queryByText('The answer could not finish.')).not.toBeInTheDocument()
    })

    it('keeps the foreground stop action separate from durable answer cancellation', () => {
      configureMessages(continuationMessages('finalizing'), 'streaming')
      const fetchSpy = vi.spyOn(global, 'fetch')
      render(<ChatContainer isAuthenticated />)
      fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))
      expect(mockStop).toHaveBeenCalledOnce()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('uses concise Chinese continuation copy', () => {
      mockLocale = 'zh'
      configureMessages(continuationMessages('waiting_task'))
      render(<ChatContainer isAuthenticated />)
      expect(screen.getByText('视频处理完成后，将继续回答。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '取消回答' })).toBeEnabled()
    })
  })
})
