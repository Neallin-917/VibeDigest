'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isDataUIPart } from 'ai'
import { ChatInput } from './ChatInput'
import { WelcomeScreen } from './WelcomeScreen'
import { MessageRow } from './MessageRow'
import { TaskDataGroup } from './TaskDataGroup'
import { cn } from '@/lib/utils'
import { checkHasRenderableAssistant } from '@/lib/chat-perf-utils'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { extractAndNormalizeUrl } from '@/lib/url-utils'
import { useChatScroll } from './useChatScroll'
import { useDirectUrlSubmission } from './useDirectUrlSubmission'

import { Loader2, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '@/components/i18n/I18nProvider'
import { chatDataSchemas, createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui'

interface ChatContainerProps {
  activeTaskId?: string | null
  threadId?: string | null
  initialMessages?: ChatUIMessage[]
  isAuthenticated?: boolean
  isInteractionLocked?: boolean
  onOpenPanel?: (taskId: string) => void
  onSelectExample?: (taskId: string) => void
  onChatStarted?: (threadId: string, taskId?: string) => void
}

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
  isAuthenticated = false,
  isInteractionLocked = false,
  onOpenPanel,
  onSelectExample,
  onChatStarted
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

  // 1. Setup useChat with AI SDK v6 Best Practices
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

  const handleSendMessage = (content: string) => {
    if (isInteractionLocked) return

    const trimmed = content.trim()
    if (!trimmed) return

    // Auth gate: save message and redirect to login for unauthenticated users
    if (!isAuthenticated) {
      localStorage.setItem('vibedigest_pending_message', trimmed)
      handleLogin()
      return
    }

    // Direct URL path: detect URL and bypass LLM entirely
    const detectedUrl = extractAndNormalizeUrl(trimmed)
    if (detectedUrl) {
      handleDirectUrlSubmission(detectedUrl, trimmed)
      return
    }

    // Non-URL messages: send through LLM for Q&A
    sendMessageToApi(createUserTextMessage(`user-${uuidv4()}`, trimmed))
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
      ? 'Something went wrong.'
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
  const liveTaskIdsByMessage = useMemo(() => {
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
  const showStandaloneTaskGroup = Boolean(activeTaskId && renderMessages.length === 0 && !streamingMessage)

  // Handle pending landing page message
  useEffect(() => {
    const pendingMessage = localStorage.getItem('vibedigest_pending_message')
    if (pendingMessage) {
      localStorage.removeItem('vibedigest_pending_message')
      // Small delay to ensure hydration
      setTimeout(() => handleSendMessage(pendingMessage), 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* handleSendMessage is already defined above */

  const handleSubmit = (text: string) => {
    handleSendMessage(text);
  }

  // Auto-open panel when a task is created
  const lastAutoOpenedTaskId = useRef<string | null>(null)

  useEffect(() => {
    if (!onOpenPanel || messages.length === 0) return

    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant' || !lastMessage.parts) return

    // Check for create_task tool output
    for (const part of lastMessage.parts) {
      // Identify tool name
      let toolName = ''
      const p = part as { type: string; toolName?: string; output?: { taskId?: string }; input?: object };
      if (p.type === 'dynamic-tool') {
        toolName = p.toolName || ''
      } else if (p.type && p.type.startsWith('tool-')) {
        toolName = p.type.replace('tool-', '')
      }

      if (toolName === 'create_task' && (p as { output?: { taskId?: string } }).output && (p as { output?: { taskId?: string } }).output?.taskId) {
        const newTaskId = (p as { output?: { taskId: string } }).output?.taskId

        // Only trigger if we haven't already opened this specific task
        // AND if it's not the currently active task (to avoid redundant calls)
        // Note: The 1:1 Thread-Task enforcement in the backend already prevents
        // multiple tasks in one thread, making this guard sufficient
        if (newTaskId && newTaskId !== lastAutoOpenedTaskId.current && newTaskId !== activeTaskId) {
          lastAutoOpenedTaskId.current = newTaskId
          onOpenPanel(newTaskId)
        }
      }
    }
  }, [messages, onOpenPanel, activeTaskId])

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-6 custom-scrollbar',
          status === 'streaming' ? 'scroll-auto' : 'scroll-smooth',
          (messages.length > 0 || !!activeTaskId) ? 'pb-44 md:pb-56' : '',
        )}
      >
        {messages.length === 0 && !activeTaskId ? (
          <WelcomeScreen
            onSelectExample={onSelectExample || (() => { })}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            isAuthenticated={isAuthenticated}
          />
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-8">
            {showStandaloneTaskGroup ? (
              <TaskDataGroup
                taskStatus={{
                  taskId: activeTaskId!,
                  status: 'pending',
                  progress: 0,
                }}
                showProgress
                showPlan
                live
                onOpenPanel={onOpenPanel}
              />
            ) : null}
            {/* Performance: No AnimatePresence wrapper — only the newest message gets motion */}
            {renderMessages.map((m, index) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={false}
                enableMotion={index === renderMessages.length - 1}
                onOpenPanel={onOpenPanel}
                liveTaskIds={liveTaskIdsByMessage.get(m.id)}
              />
            ))}

            {streamingMessage ? (
              <MessageRow
                key={streamingMessage.id}
                message={streamingMessage}
                isStreaming
                enableMotion={false}
                onOpenPanel={onOpenPanel}
                liveTaskIds={new Set<string>()}
              />
            ) : null}

            {/* Loading Indicator - Only show when submitted but not yet streaming (waiting for first chunk) */}
            {(status === 'submitted' || (status === 'streaming' && !hasRenderableAssistant)) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex w-full">
                <div className="flex flex-col gap-2">
                  <div className="bg-white/40 dark:bg-white/5 px-5 py-3 rounded-2xl rounded-tl-sm border border-white/40 dark:border-white/5 flex items-center gap-2 w-fit">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      Thinking...
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

          </div>
        )}
      </div>

      {displayErrorMessage && (
        <div className="px-4 md:px-8 pb-4">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full">
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 px-4 py-3 rounded-xl flex items-center gap-3">
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
                    Retry
                  </button>
                ) : null}
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {(messages.length > 0 || activeTaskId) && (
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
