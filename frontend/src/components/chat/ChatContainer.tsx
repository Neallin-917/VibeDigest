'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isDataUIPart } from 'ai'
import { ChatInput } from './ChatInput'
import { WelcomeScreen } from './WelcomeScreen'
import { cn } from '@/lib/utils'
import { checkHasRenderableAssistant } from '@/lib/chat-perf-utils'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { extractAndNormalizeUrl } from '@/lib/url-utils'
import { useChatScroll } from './useChatScroll'
import { useDirectUrlSubmission } from './useDirectUrlSubmission'

import { XCircle } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { chatDataSchemas, createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui'
import { LazyMessageRow as MessageRow, preloadMessageRow } from './LazyMessageRow'
import type { ChatExample } from '@/lib/chat-examples'
import { ProcessingIndicator } from './ProcessingIndicator'

interface ChatContainerProps {
  activeTaskId?: string | null
  threadId?: string | null
  initialMessages?: ChatUIMessage[]
  isAuthenticated?: boolean | null
  isInteractionLocked?: boolean
  onOpenPanel?: (taskId: string) => void
  onSelectExample?: (taskId: string) => void
  onChatStarted?: (threadId: string, taskId?: string) => void
  initialExamples?: Promise<ChatExample[]> | null
}

const NO_TASK_IDS = new Set<string>()

function isAuthRequiredError(err: unknown) {
  if (!err) return false

  const status = (err as { status?: number })?.status
  if (status === 401) return true

  const responseStatus = (err as { response?: { status?: number } })?.response?.status
  if (responseStatus === 401) return true

  const causeStatus = (err as { cause?: { status?: number } })?.cause?.status
  if (causeStatus === 401) return true

  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const details =
    (err as { details?: string })?.details ||
    (err as { data?: { details?: string } })?.data?.details ||
    (err as { body?: { details?: string } })?.body?.details ||
    (err as { cause?: { details?: string } })?.cause?.details ||
    (err as { cause?: { data?: { details?: string } } })?.cause?.data?.details
  const errorText =
    (err as { error?: string })?.error ||
    (err as { data?: { error?: string } })?.data?.error ||
    (err as { body?: { error?: string } })?.body?.error

  const combined = [message, details, errorText].filter(Boolean).join(' ')
  return /unauthorized|auth session missing/i.test(combined)
}

function hasSameMessageIdentity(currentMessages: ChatUIMessage[], nextMessages: ChatUIMessage[]) {
  if (currentMessages.length !== nextMessages.length) return false

  return currentMessages.every((message, index) => {
    const nextMessage = nextMessages[index]
    return message.id === nextMessage?.id && message.role === nextMessage?.role
  })
}

export function ChatContainer({
  activeTaskId,
  threadId,
  initialMessages = [],
  isAuthenticated = null,
  isInteractionLocked = false,
  onOpenPanel,
  onSelectExample,
  onChatStarted,
  initialExamples = null
}: ChatContainerProps) {

  const { t, locale } = useI18n()

  const activeTaskIdRef = useRef<string | null | undefined>(activeTaskId)

  // Ensure we always have a valid UUID for the thread ID to satisfy DB requirements
  // Use lazy state initialization to generate once per component mount
  const [sessionId] = useState(() => threadId || uuidv4())
  const effectiveThreadId = threadId || sessionId
  const prepareSendMessagesRequest = useCallback(
    ({ messages: currentMessages }: { messages: ChatUIMessage[] }) => {
      const lastMessage = currentMessages[currentMessages.length - 1]

      return {
        body: {
          message: lastMessage,
          threadId: effectiveThreadId,
          taskId: activeTaskIdRef.current,
        },
      }
    },
    [effectiveThreadId],
  )
  const transport = useMemo(
    () =>
      // The ref is read by the send callback later, never by render/constructor.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest,
      }),
    [prepareSendMessagesRequest],
  )

  // 1. Setup useChat with the AI SDK v7 transport and typed data parts.
  const chat = useChat<ChatUIMessage>({
    transport,

    // Session ID
    id: effectiveThreadId,

    // Initial state
    // Pass initial messages if provided
    // Note: useChat in strict mode options might not have 'initialMessages', 
    // but the hook signature usually accepts it. 
    // If TSC complains, we rely on the useEffect below to set messages.
    // However, to avoid flashing empty state, passing it here is better if accepted.
    // Since TS complained about 'initialMessages' not existing in options, we try 'messages' (if ChatInit is mixed in).
    messages: initialMessages,
    dataPartSchemas: chatDataSchemas as never,

    // Error handling
    onError: (err: Error | unknown) => {
      console.error('Chat error:', err);
    },

    // Notify parent once a chat is persisted
    onFinish: () => {
      if (onChatStarted) {
        onChatStarted(effectiveThreadId)
      }
    }
  })

  // Destructure with standard types (no casting needed)
  const {
    messages,
    setMessages,
    sendMessage: sendMessageToApi,
    status,
    error,
    regenerate,
    stop
  } = chat

  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const requiresAuth = useMemo(() => isAuthRequiredError(error), [error])

  const handleLogin = () => {
    const nextPath = `${window.location.pathname}${window.location.search}`
    const loginUrl = `/${locale}/login?next=${encodeURIComponent(nextPath)}`
    window.location.href = loginUrl
  }

  const { isDirectProcessing, directSubmitError, handleDirectUrlSubmission } = useDirectUrlSubmission({
    sendMessageToApi,
    setMessages,
    onChatStarted,
    effectiveThreadId,
    activeTaskIdRef,
  })

  const handleSendMessage = async (content: string): Promise<boolean> => {
    if (isInteractionLocked) return false

    const trimmed = content.trim()
    if (!trimmed) return false

    // The initial browser session arrives asynchronously. Queue the submission
    // until that local session is known instead of misrouting a signed-in user.
    if (isAuthenticated === null) {
      localStorage.setItem('vibedigest_pending_message', trimmed)
      return true
    }

    // Auth gate: save message and redirect to login for unauthenticated users.
    if (isAuthenticated === false) {
      localStorage.setItem('vibedigest_pending_message', trimmed)
      handleLogin()
      return true
    }

    // Start loading the renderer while direct-submit/chat requests run.
    // Fresh and unauthenticated chats do not pay this cost.
    void preloadMessageRow()

    // Direct URL path: detect URL and bypass LLM entirely
    const detectedUrl = extractAndNormalizeUrl(trimmed)
    if (detectedUrl) {
      return handleDirectUrlSubmission(detectedUrl, trimmed)
    }

    // Non-URL messages: send through LLM for Q&A
    sendMessageToApi(createUserTextMessage(`user-${uuidv4()}`, trimmed))
    return true
  }

  // Sync initialMessages when they change
  useEffect(() => {
    if (hasSameMessageIdentity(messagesRef.current, initialMessages)) return
    setMessages(initialMessages)
  }, [initialMessages, setMessages])

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId
  }, [activeTaskId])

  const isLoading = status === 'streaming' || status === 'submitted' || isDirectProcessing
  const displayErrorMessage = directSubmitError ?? (requiresAuth
    ? t('auth.signInToContinue', { appName: t('brand.appName') })
    : error
      ? t('chat.genericError')
      : null)
  const hasRenderableAssistant = useMemo(
    () => checkHasRenderableAssistant(messages),
    [messages]
  )
  const lastMessage = messages[messages.length - 1]
  const streamingMessage =
    status === 'streaming' && lastMessage?.role === 'assistant' ? lastMessage : null
  const historyMessages = streamingMessage ? messages.slice(0, -1) : messages
  const renderMessages = historyMessages
  const latestTaskIdsByMessage = useMemo(() => {
    const latestTaskMessageIds = new Map<string, string>()

    renderMessages.forEach(message => {
      message.parts?.forEach(part => {
        if (!isDataUIPart(part)) return
        if (!('data' in part) || typeof part.data !== 'object' || part.data === null) return

        const taskId =
          'taskId' in part.data && typeof part.data.taskId === 'string'
            ? part.data.taskId
            : null

        if (taskId) {
          latestTaskMessageIds.set(taskId, message.id)
        }
      })
    })

    const result = new Map<string, Set<string>>()
    latestTaskMessageIds.forEach((messageId, taskId) => {
      const taskIds = result.get(messageId) ?? new Set<string>()
      taskIds.add(taskId)
      result.set(messageId, taskIds)
    })

    return result
  }, [renderMessages])

  const { scrollRef, handleScroll } = useChatScroll({ messages, status, activeTaskId })

  const handledPendingMessageRef = useRef(false)

  // Handle a pending landing/login message once the browser session is known.
  useEffect(() => {
    if (isAuthenticated === null || handledPendingMessageRef.current) return

    const pendingMessage = localStorage.getItem('vibedigest_pending_message')
    if (pendingMessage) {
      handledPendingMessageRef.current = true
      localStorage.removeItem('vibedigest_pending_message')
      void handleSendMessage(pendingMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  /* handleSendMessage is already defined above */

  const handleSubmit = (text: string) => handleSendMessage(text)

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-6 custom-scrollbar',
          status === 'streaming' ? 'scroll-auto' : 'scroll-smooth',
          messages.length > 0 ? 'pb-44 md:pb-56' : '',
        )}
      >
        {messages.length === 0 ? (
          <WelcomeScreen
            onSelectExample={onSelectExample || (() => { })}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            isAuthenticated={isAuthenticated}
            initialExamples={initialExamples}
          />
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-8">
            {renderMessages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={false}
                onOpenPanel={onOpenPanel}
                liveTaskIds={latestTaskIdsByMessage.get(m.id)}
                visibleTaskIds={latestTaskIdsByMessage.get(m.id) ?? NO_TASK_IDS}
              />
            ))}

            {streamingMessage ? (
              <MessageRow
                key={streamingMessage.id}
                message={streamingMessage}
                isStreaming
                onOpenPanel={onOpenPanel}
                liveTaskIds={NO_TASK_IDS}
              />
            ) : null}

            {/* Loading Indicator - Only show when submitted but not yet streaming (waiting for first chunk) */}
            {(status === 'submitted' || (status === 'streaming' && !hasRenderableAssistant)) && (
              <div className="flex w-full">
                <div className="flex flex-col gap-2">
                  <div className="bg-white/40 dark:bg-white/5 px-5 py-3 rounded-2xl rounded-tl-sm border border-white/40 dark:border-white/5 flex items-center gap-2 w-fit">
                    <ProcessingIndicator
                      label={t('chat.thinking')}
                      className="text-sm text-slate-500 dark:text-slate-400 font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {displayErrorMessage && (
        <div className="px-4 md:px-8 pb-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex w-full">
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 px-4 py-3 rounded-xl flex items-center gap-3"
              >
                <XCircle className="w-4 h-4 text-red-500" />
                <div className="text-sm text-red-600 dark:text-red-400">
                  {directSubmitError ?? displayErrorMessage}
                </div>
                {requiresAuth ? (
                  <button
                    onClick={handleLogin}
                    className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {t('auth.signIn')}
                  </button>
                ) : error && !directSubmitError ? (
                  <button
                    onClick={() => regenerate()}
                    className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {t('chat.retry')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <ChatInput
          variant="floating"
          onSubmit={handleSubmit}
          isLoading={isLoading}
          disabled={isInteractionLocked}
          onStop={status === 'streaming' ? stop : undefined}
        />
      )}
    </div >
  )
}
