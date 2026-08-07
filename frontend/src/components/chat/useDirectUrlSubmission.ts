import { useState, useCallback } from 'react'
import type { ChatUIMessage } from '@/lib/chat-ui'
import { sanitizeErrorMessage } from '@/lib/safe-error'
import { useI18n } from '@/components/i18n/I18nProvider'

export function useDirectUrlSubmission(deps: {
  sendMessageToApi: (params: { text: string }) => void
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>
  onChatStarted?: (threadId: string, taskId?: string) => void
  effectiveThreadId: string
  activeTaskIdRef: React.RefObject<string | null | undefined>
}): {
  isDirectProcessing: boolean
  directSubmitError: string | null
  directSubmitQuotaExceeded: boolean
  handleDirectUrlSubmission: (url: string, originalText: string) => Promise<boolean>
} {
  const { setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef } = deps
  const { t, locale } = useI18n()

  const [isDirectProcessing, setIsDirectProcessing] = useState(false)
  const [directSubmitError, setDirectSubmitError] = useState<string | null>(null)
  const [directSubmitQuotaExceeded, setDirectSubmitQuotaExceeded] = useState(false)

  /**
   * Direct URL submission: bypass LLM tool calls entirely.
   * Calls a dedicated server route that creates the task, persists the chat,
   * and returns assistant messages that already use data parts.
   */
  const handleDirectUrlSubmission = useCallback(async (url: string, originalText: string) => {
    setIsDirectProcessing(true)
    setDirectSubmitError(null)
    setDirectSubmitQuotaExceeded(false)
    try {
      const res = await fetch('/api/chat/direct-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: url,
          originalText,
          threadId: effectiveThreadId,
          uiLocale: locale,
        }),
      })

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const quotaExceeded =
          errorPayload &&
          typeof errorPayload === 'object' &&
          'code' in errorPayload &&
          errorPayload.code === 'QUOTA_EXCEEDED'
        const details =
          errorPayload && typeof errorPayload === 'object' && 'details' in errorPayload && typeof errorPayload.details === 'string'
            ? errorPayload.details
            : errorPayload && typeof errorPayload === 'object' && 'error' in errorPayload && typeof errorPayload.error === 'string'
              ? errorPayload.error
              : t('chat.directSubmit.unavailable')
        setDirectSubmitError(
          quotaExceeded
            ? t('taskForm.quotaExceeded.description')
            : sanitizeErrorMessage(details),
        )
        setDirectSubmitQuotaExceeded(quotaExceeded)
        return false
      }

      const data = await res.json()
      const taskId = data.task_id
      const messages = Array.isArray(data.messages) ? (data.messages as ChatUIMessage[]) : null

      if (!taskId || !messages) {
        setDirectSubmitError(t('chat.directSubmit.invalidResponse'))
        return false
      }

      setMessages(prev => [...prev, ...messages])

      // Update active task ref so RAG context is available for follow-up Q&A
      activeTaskIdRef.current = taskId

      // Notify parent: persist thread + activate task (opens panel via activeTaskId)
      if (onChatStarted) {
        onChatStarted(effectiveThreadId, taskId)
      }

      return true
    } catch {
      setDirectSubmitError(t('chat.directSubmit.networkError'))
      return false
    } finally {
      setIsDirectProcessing(false)
    }
  }, [setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef, locale, t])

  return {
    isDirectProcessing,
    directSubmitError,
    directSubmitQuotaExceeded,
    handleDirectUrlSubmission,
  }
}
