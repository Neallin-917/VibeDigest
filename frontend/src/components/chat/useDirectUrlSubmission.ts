import { useState, useCallback } from 'react'
import type { ChatUIMessage } from '@/lib/chat-ui'

export function useDirectUrlSubmission(deps: {
  sendMessageToApi: (params: { text: string }) => void
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>
  onChatStarted?: (threadId: string, taskId?: string) => void
  effectiveThreadId: string
  activeTaskIdRef: React.RefObject<string | null | undefined>
}): {
  isDirectProcessing: boolean
  directSubmitError: string | null
  handleDirectUrlSubmission: (url: string, originalText: string) => Promise<void>
} {
  const { setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef } = deps

  const [isDirectProcessing, setIsDirectProcessing] = useState(false)
  const [directSubmitError, setDirectSubmitError] = useState<string | null>(null)

  /**
   * Direct URL submission: bypass LLM tool calls entirely.
   * Calls a dedicated server route that creates the task, persists the chat,
   * and returns assistant messages that already use data parts.
   */
  const handleDirectUrlSubmission = useCallback(async (url: string, originalText: string) => {
    setIsDirectProcessing(true)
    setDirectSubmitError(null)
    try {
      const res = await fetch('/api/chat/direct-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: url,
          originalText,
          threadId: effectiveThreadId,
        }),
      })

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const details =
          errorPayload && typeof errorPayload === 'object' && 'details' in errorPayload && typeof errorPayload.details === 'string'
            ? errorPayload.details
            : errorPayload && typeof errorPayload === 'object' && 'error' in errorPayload && typeof errorPayload.error === 'string'
              ? errorPayload.error
              : 'Unable to process this video right now.'
        setDirectSubmitError(details)
        return
      }

      const data = await res.json()
      const taskId = data.task_id
      const messages = Array.isArray(data.messages) ? (data.messages as ChatUIMessage[]) : null

      if (!taskId || !messages) {
        setDirectSubmitError('Unable to create a task for this URL.')
        return
      }

      setMessages(prev => [...prev, ...messages])

      // Update active task ref so RAG context is available for follow-up Q&A
      activeTaskIdRef.current = taskId

      // Notify parent: persist thread + activate task (opens panel via activeTaskId)
      if (onChatStarted) {
        onChatStarted(effectiveThreadId, taskId)
      }
    } catch {
      setDirectSubmitError('Network error while starting video processing.')
    } finally {
      setIsDirectProcessing(false)
    }
  }, [setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef])

  return { isDirectProcessing, directSubmitError, handleDirectUrlSubmission }
}
