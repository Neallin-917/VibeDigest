'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, UIMessage } from 'ai'
import { ChatInput } from './ChatInput'
import { WelcomeScreen } from './WelcomeScreen'
import { MessageRow } from './MessageRow'
import { cn } from '@/lib/utils'
import { checkHasRenderableAssistant, checkHasTaskStatusForActiveTask } from '@/lib/chat-perf-utils'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { extractAndNormalizeUrl } from '@/lib/url-utils'

import { Loader2, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '@/components/i18n/I18nProvider'

interface ChatContainerProps {
  activeTaskId?: string | null
  threadId?: string | null
  initialMessages?: UIMessage[]
  isAuthenticated?: boolean
  onOpenPanel?: (taskId: string) => void
  onSelectExample?: (taskId: string) => void
  onChatStarted?: (threadId: string) => void
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

export function ChatContainer({
  activeTaskId,
  threadId,
  initialMessages = [],
  isAuthenticated = false,
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

  // 1. Setup useChat with AI SDK v6 Best Practices
  const chat = useChat({
    // IMPORTANT: Use DefaultChatTransport for full v6 compatibility
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // Optimize: Only send the new message and context, not the full history
      // The backend will load history from DB
      prepareSendMessagesRequest: ({ messages: currentMessages }) => {
        const lastMessage = currentMessages[currentMessages.length - 1]

        return {
          body: {
            message: lastMessage,
            threadId: effectiveThreadId,     // Persist to this thread
            taskId: activeTaskIdRef.current    // RAG context
          }
        }
      }
    }),

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

  const requiresAuth = useMemo(() => isAuthRequiredError(error), [error])

  const handleLogin = () => {
    const nextPath = `${window.location.pathname}${window.location.search}`
    const loginUrl = `/${locale}/login?next=${encodeURIComponent(nextPath)}`
    window.location.href = loginUrl
  }

  // Track whether a direct URL submission is in progress
  const [isDirectProcessing, setIsDirectProcessing] = useState(false)

  /**
   * Direct URL submission: bypass LLM tool calls entirely.
   * Calls /api/process-video directly, then injects synthetic messages
   * so the existing GetTaskStatusTool UI + Realtime subscription handles updates.
   */
  const handleDirectUrlSubmission = useCallback(async (url: string, originalText: string) => {
    setIsDirectProcessing(true)
    try {
      const res = await fetch('/api/process-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: url }),
      })

      if (!res.ok) {
        // Fall back to LLM path on API error
        sendMessageToApi({ text: originalText })
        return
      }

      const data = await res.json()
      const taskId = data.task_id

      if (!taskId) {
        sendMessageToApi({ text: originalText })
        return
      }

      // Inject synthetic messages: user message + assistant with task status card
      const userMsgId = `direct-user-${uuidv4()}`
      const assistantMsgId = `direct-assistant-${uuidv4()}`
      const toolCallId = `direct-status-${taskId}`

      const userMsg: UIMessage = {
        id: userMsgId,
        role: 'user',
        parts: [{ type: 'text', text: originalText }],
      }

      const assistantMsg: UIMessage = {
        id: assistantMsgId,
        role: 'assistant',
        parts: [
          {
            type: 'tool-get_task_status' as unknown as 'text',
            toolCallId,
            state: 'output-available',
            input: { taskId },
            output: { taskId, status: 'pending', progress: 0 },
          } as unknown as UIMessage['parts'][number],
        ],
      }

      setMessages(prev => [...prev, userMsg, assistantMsg])

      // Update active task ref so RAG context is available for follow-up Q&A
      activeTaskIdRef.current = taskId

      // Auto-open the video detail panel
      if (onOpenPanel) {
        onOpenPanel(taskId)
      }

      // Notify parent that chat has started
      if (onChatStarted) {
        onChatStarted(effectiveThreadId)
      }
    } catch {
      // Network error: fall back to LLM path
      sendMessageToApi({ text: originalText })
    } finally {
      setIsDirectProcessing(false)
    }
  }, [sendMessageToApi, setMessages, onOpenPanel, onChatStarted, effectiveThreadId])

  const handleSendMessage = (content: string) => {
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
    sendMessageToApi({ text: trimmed })
  }

  // Sync initialMessages when they change
  useEffect(() => {
    // If initialMessages are provided (and valid), update the chat state.
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages)
    } else if (initialMessages && initialMessages.length === 0) {
      setMessages([])
    }
  }, [initialMessages, setMessages])

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId
  }, [activeTaskId])

  const isLoading = status === 'streaming' || status === 'submitted' || isDirectProcessing
  const hasRenderableAssistant = useMemo(
    () => checkHasRenderableAssistant(messages),
    [messages]
  )
  const hasTaskStatusForActiveTask = useMemo(
    () => checkHasTaskStatusForActiveTask(messages, activeTaskId ?? null),
    [messages, activeTaskId]
  )
  const forcedTaskStatusMessage = useMemo<UIMessage | null>(() => {
    if (!activeTaskId || hasTaskStatusForActiveTask) return null
    const toolCallId = `task-status-${activeTaskId}`
    return {
      id: toolCallId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-get_task_status',
          toolCallId,
          state: 'output-available',
          input: { taskId: activeTaskId },
          output: {
            taskId: activeTaskId,
            status: 'pending',
            progress: 0
          }
        }
      ]
    }
  }, [activeTaskId, hasTaskStatusForActiveTask])
  const lastMessage = messages[messages.length - 1]
  const streamingMessage =
    status === 'streaming' && lastMessage?.role === 'assistant' ? lastMessage : null
  const historyMessages = streamingMessage ? messages.slice(0, -1) : messages
  const renderMessages = forcedTaskStatusMessage
    ? [forcedTaskStatusMessage, ...historyMessages]
    : historyMessages

  const scrollRef = useRef<HTMLDivElement>(null)
  const isUserNearBottomRef = useRef(true)

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight
    isUserNearBottomRef.current = distanceToBottom < 100 // 100px threshold
  }

  // Auto-scroll to bottom
  useEffect(() => {
    // Skip auto-scroll if showing Welcome Screen (no messages and no active task context)
    if (messages.length === 0 && !activeTaskId) return

    if (scrollRef.current && isUserNearBottomRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      })
    }
  }, [messages, status, activeTaskId])

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
            {/* Performance: No AnimatePresence wrapper — only the newest message gets motion */}
            {renderMessages.map((m, index) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={false}
                enableMotion={index === renderMessages.length - 1}
                onOpenPanel={onOpenPanel}
              />
            ))}

            {streamingMessage ? (
              <MessageRow
                key={streamingMessage.id}
                message={streamingMessage}
                isStreaming
                enableMotion={false}
                onOpenPanel={onOpenPanel}
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

            {/* Error State */}
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full">
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 px-4 py-3 rounded-xl flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {requiresAuth
                      ? t('auth.signInToContinue', { appName: t('brand.appName') })
                      : 'Something went wrong.'}
                  </div>
                  {requiresAuth ? (
                    <button
                      onClick={handleLogin}
                      className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      {t('auth.signIn')}
                    </button>
                  ) : (
                    <button
                      onClick={() => regenerate()}
                      className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {(messages.length > 0 || activeTaskId) && (
        <ChatInput
          variant="floating"
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onStop={status === 'streaming' ? stop : undefined}
        />
      )}
    </div >
  )
}
