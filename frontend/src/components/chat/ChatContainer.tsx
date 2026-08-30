'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isDataUIPart } from 'ai'
import { ChatInput } from './ChatInput'
import { WelcomeScreen } from './WelcomeScreen'
import { cn } from '@/lib/utils'
import { checkHasRenderableAssistant } from '@/lib/chat-perf-utils'
import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useChatScroll } from './useChatScroll'
import { useChatRealtime } from './useChatRealtime'

import { XCircle } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { chatDataSchemas, createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui'
import { LazyMessageRow as MessageRow, preloadMessageRow } from './LazyMessageRow'
import type { ChatExample } from '@/lib/chat-examples'
import { ProcessingIndicator } from './ProcessingIndicator'
import { sanitizeErrorMessage } from '@/lib/safe-error'

interface ChatContainerProps {
  activeTaskId?: string | null
  threadId?: string | null
  initialMessages?: ChatUIMessage[]
  isAuthenticated?: boolean | null
  isInteractionLocked?: boolean
  onSelectExample?: (task: ChatExample) => void
  onChatStarted?: (threadId: string, taskId?: string) => void
  initialExamples?: Promise<ChatExample[]> | null
  variant?: 'workspace' | 'embedded'
  scope?: 'workspace' | 'source'
  showTaskArtifacts?: boolean
}

const NO_TASK_IDS = new Set<string>()
const EMPTY_MESSAGES: ChatUIMessage[] = []
const CONTINUATION_COPY = {
  en: {
    waiting_task: 'Your answer will continue when the video is ready.',
    finalizing: 'Preparing your answer.',
    failed: 'The answer could not finish.',
    cancelled: 'Follow-up answer cancelled. Video processing is unchanged.',
    cancel: 'Cancel answer',
    retry: 'Retry answer',
    cancelFailed: 'Could not cancel the answer. Please try again.',
    retryFailed: 'Could not retry the answer. Please try again.',
  },
  zh: {
    waiting_task: '视频处理完成后，将继续回答。',
    finalizing: '正在整理回答。',
    failed: '回答未能完成。',
    cancelled: '已取消后续回答；视频处理不受影响。',
    cancel: '取消回答',
    retry: '重试回答',
    cancelFailed: '未能取消回答，请重试。',
    retryFailed: '未能重试回答，请稍后再试。',
  },
  ja: {
    waiting_task: '動画の処理が完了すると、回答を続けます。',
    finalizing: '回答をまとめています。',
    failed: '回答を完了できませんでした。',
    cancelled: '続きの回答をキャンセルしました。動画の処理は継続します。',
    cancel: '回答をキャンセル', retry: '回答を再試行',
    cancelFailed: 'キャンセルできませんでした。もう一度お試しください。',
    retryFailed: '再試行できませんでした。しばらくしてからお試しください。',
  },
}

type AnswerActionResult = {
  threadId: string
  turnId: string
  state: 'cancelled' | 'terminal' | 'error'
  error?: string
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

function latestConfirmedTaskId(messages: ChatUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const parts = messages[index].parts
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex]
      if (part.type === 'data-task-status' && part.data.taskId) return part.data.taskId
    }
  }
}

export function ChatContainer({
  activeTaskId,
  threadId,
  initialMessages = EMPTY_MESSAGES,
  isAuthenticated = null,
  isInteractionLocked = false,
  onSelectExample,
  onChatStarted,
  initialExamples = null,
  variant = 'workspace',
  scope = 'workspace',
  showTaskArtifacts = true,
}: ChatContainerProps) {

  const { t, locale } = useI18n()

  const activeTaskIdRef = useRef<string | null | undefined>(activeTaskId)

  // Ensure we always have a valid UUID for the thread ID to satisfy DB requirements
  // Use lazy state initialization to generate once per component mount
  const [sessionId] = useState(() => threadId || uuidv4())
  const effectiveThreadId = threadId || sessionId
  const prepareSendMessagesRequest = useCallback(
    ({ messages: currentMessages }: { messages: ChatUIMessage[] }) => {
      const userMessage = [...currentMessages].reverse().find(message => message.role === 'user')
      if (!userMessage) throw new Error('No user message is available to send.')

      return {
        body: {
          message: {
            id: userMessage.id,
            role: 'user',
            parts: userMessage.parts.filter(part => part.type === 'text').map(part => ({ type: 'text', text: part.text })),
          },
          threadId: effectiveThreadId,
          taskId: activeTaskIdRef.current,
          locale,
          scope,
        },
      }
    },
    [effectiveThreadId, locale, scope],
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

    messages: initialMessages,
    dataPartSchemas: chatDataSchemas as never,

    // Error handling
    onError: (err: Error | unknown) => {
      console.error('Chat error:', err);
    },

    // Notify parent once a chat is persisted
    onFinish: ({ messages: finishedMessages, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) return
      const taskId = latestConfirmedTaskId(finishedMessages) ?? activeTaskIdRef.current ?? undefined
      if (taskId) activeTaskIdRef.current = taskId
      onChatStarted?.(effectiveThreadId, taskId)
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

  useChatRealtime({
    threadId: effectiveThreadId,
    enabled: isAuthenticated === true,
    status,
    messages,
    initialMessages,
    setMessages,
  })

  const requiresAuth = useMemo(() => isAuthRequiredError(error), [error])

  const handleLogin = () => {
    const nextPath = `${window.location.pathname}${window.location.search}`
    const loginUrl = `/${locale}/login?next=${encodeURIComponent(nextPath)}`
    window.location.href = loginUrl
  }

  const [taskRetryError, setTaskRetryError] = useState<string | null>(null)
  const [isAnswerActionPending, setIsAnswerActionPending] = useState(false)
  const [answerActionResult, setAnswerActionResult] = useState<AnswerActionResult | null>(null)
  const answerActionInFlight = useRef(false)

  const handleTaskRetry = useCallback(async (taskId: string) => {
    setTaskRetryError(null)

    try {
      const res = await fetch('/api/chat/retry-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const details =
          errorPayload && typeof errorPayload === 'object' && 'details' in errorPayload && typeof errorPayload.details === 'string'
            ? errorPayload.details
            : errorPayload && typeof errorPayload === 'object' && 'error' in errorPayload && typeof errorPayload.error === 'string'
              ? errorPayload.error
              : t('chat.genericError')
        setTaskRetryError(sanitizeErrorMessage(details))
        return false
      }

      return true
    } catch {
      setTaskRetryError(t('chat.genericError'))
      return false
    }
  }, [t])

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

    // Start loading the renderer while the Agent request runs.
    // Fresh and unauthenticated chats do not pay this cost.
    void preloadMessageRow()

    // Every input, including a URL, goes through the Agent's intent decision.
    sendMessageToApi(createUserTextMessage(`user-${uuidv4()}`, trimmed))
    return true
  }

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId
  }, [activeTaskId])

  const isLoading = status === 'streaming' || status === 'submitted'
  const continuationCopy = CONTINUATION_COPY[locale]
  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant')
  const agentTurnId = latestAssistant?.metadata?.agentTurnId
  const agentState = latestAssistant?.metadata?.agentState
  const matchingActionResult = answerActionResult?.threadId === effectiveThreadId
    && answerActionResult.turnId === agentTurnId ? answerActionResult : null
  const hasPendingContinuation = agentState === 'waiting_task' || agentState === 'finalizing'
  const continuationState = agentTurnId && (
    hasPendingContinuation || agentState === 'failed' || agentState === 'cancelled'
  ) ? hasPendingContinuation && matchingActionResult?.state === 'cancelled'
      ? 'cancelled'
      : hasPendingContinuation && matchingActionResult?.state === 'terminal'
        ? null
        : agentState
    : null
  const answerActionsDisabled = isInteractionLocked || isLoading || isAnswerActionPending || isAuthenticated !== true
  const canRetryAnswer = messages.some(message => message.role === 'user')

  const handleCancelAnswer = async () => {
    if (!agentTurnId || !hasPendingContinuation || answerActionsDisabled || answerActionInFlight.current) return
    answerActionInFlight.current = true
    setIsAnswerActionPending(true)
    setAnswerActionResult(null)
    try {
      const response = await fetch(`/api/chat/turns/${encodeURIComponent(agentTurnId)}/cancel`, { method: 'POST' })
      if (!response.ok) throw new Error('Cancellation request failed.')
      const result: unknown = await response.json()
      if (typeof result !== 'object' || result === null || !('cancelled' in result) || typeof result.cancelled !== 'boolean') {
        throw new Error('Invalid cancellation response.')
      }
      // This acknowledgement reflects a committed server transition. Do not
      // mutate video/task state or fabricate a cancelled persisted message.
      setAnswerActionResult({
        threadId: effectiveThreadId, turnId: agentTurnId,
        state: result.cancelled ? 'cancelled' : 'terminal',
      })
    } catch {
      setAnswerActionResult({
        threadId: effectiveThreadId, turnId: agentTurnId,
        state: 'error', error: continuationCopy.cancelFailed,
      })
    } finally {
      answerActionInFlight.current = false
      setIsAnswerActionPending(false)
    }
  }

  const handleRetryAnswer = async () => {
    if (!agentTurnId || agentState !== 'failed' || !canRetryAnswer || answerActionsDisabled || answerActionInFlight.current) return
    answerActionInFlight.current = true
    setIsAnswerActionPending(true)
    setAnswerActionResult(null)
    try {
      // Regenerate keeps the user's original message ID; the transport selects
      // that user message, so the backend can reuse its existing video result.
      await regenerate()
    } catch {
      setAnswerActionResult({
        threadId: effectiveThreadId, turnId: agentTurnId,
        state: 'error', error: continuationCopy.retryFailed,
      })
    } finally {
      answerActionInFlight.current = false
      setIsAnswerActionPending(false)
    }
  }

  const displayErrorMessage = taskRetryError ?? (requiresAuth
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
  const hasActiveSource = Boolean(activeTaskId && !NO_TASK_IDS.has(activeTaskId))
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

  const isEmbedded = variant === 'embedded'

  return (
    <div className={cn('flex min-h-0 flex-col relative', isEmbedded ? 'w-full' : 'h-full')}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          'min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar',
          isEmbedded
            ? 'max-h-[34rem] px-0 py-1'
            : 'flex-1 px-4 py-6 md:px-8',
          status === 'streaming' ? 'scroll-auto' : 'scroll-smooth',
          messages.length > 0 && !isEmbedded ? 'pb-44 md:pb-56' : '',
        )}
      >
        {messages.length === 0 ? (
          isEmbedded ? null : (
            <WelcomeScreen
              onSelectExample={onSelectExample || (() => { })}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
              initialExamples={initialExamples}
            />
          )
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-8">
            {renderMessages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={false}
                liveTaskIds={showTaskArtifacts ? latestTaskIdsByMessage.get(m.id) : NO_TASK_IDS}
                visibleTaskIds={showTaskArtifacts
                  ? (latestTaskIdsByMessage.get(m.id) ?? NO_TASK_IDS)
                  : NO_TASK_IDS}
                onRetryTask={handleTaskRetry}
              />
            ))}

            {streamingMessage ? (
              <MessageRow
                key={streamingMessage.id}
                message={streamingMessage}
                isStreaming
                liveTaskIds={NO_TASK_IDS}
                visibleTaskIds={showTaskArtifacts ? undefined : NO_TASK_IDS}
                onRetryTask={handleTaskRetry}
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

            {continuationState && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p role="status" aria-live="polite">{continuationCopy[continuationState]}</p>
                  {(continuationState === 'waiting_task' || continuationState === 'finalizing') && (
                    <button
                      type="button"
                      onClick={() => void handleCancelAnswer()}
                      disabled={answerActionsDisabled}
                      aria-busy={isAnswerActionPending}
                      className="underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {continuationCopy.cancel}
                    </button>
                  )}
                  {continuationState === 'failed' && (
                    <button
                      type="button"
                      onClick={() => void handleRetryAnswer()}
                      disabled={answerActionsDisabled || !canRetryAnswer}
                      aria-busy={isAnswerActionPending}
                      className="underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {continuationCopy.retry}
                    </button>
                  )}
                </div>
                {matchingActionResult?.state === 'error' && (
                  <p role="alert" className="text-destructive">{matchingActionResult.error}</p>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {displayErrorMessage && (
        <div className={cn('pb-4', isEmbedded ? 'pt-3' : 'px-4 md:px-8')}>
          <div className="max-w-3xl mx-auto">
            <div className="flex w-full">
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 px-4 py-3 rounded-xl flex items-center gap-3"
              >
                <XCircle className="w-4 h-4 text-red-500" />
                <div className="text-sm text-red-600 dark:text-red-400">
                  {displayErrorMessage}
                </div>
                {requiresAuth ? (
                  <button
                    onClick={handleLogin}
                    className="text-xs bg-white dark:bg-white/10 px-2 py-1 rounded border border-red-100 dark:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {t('auth.signIn')}
                  </button>
                ) : error && !taskRetryError && continuationState !== 'failed' ? (
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

      {(messages.length > 0 || isEmbedded) && (
        <div className={cn(isEmbedded && messages.length > 0 ? 'mt-5' : '')}>
          <ChatInput
            variant={isEmbedded ? 'inline' : 'floating'}
            hideDisclaimer={isEmbedded}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            disabled={isInteractionLocked}
            onStop={status === 'streaming' ? stop : undefined}
            placeholder={hasActiveSource ? t('chat.followUpPlaceholder') : undefined}
            inputLabel={hasActiveSource ? t('chat.followUpInputLabel') : undefined}
          />
        </div>
      )}
    </div >
  )
}
