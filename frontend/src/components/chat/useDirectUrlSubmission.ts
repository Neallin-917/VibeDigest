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
  handleDirectUrlSubmission: (url: string, originalText: string) => Promise<void>
} {
  const { sendMessageToApi, setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef } = deps

  const [isDirectProcessing, setIsDirectProcessing] = useState(false)

  /**
   * Direct URL submission: bypass LLM tool calls entirely.
   * Calls a dedicated server route that creates the task, persists the chat,
   * and returns assistant messages that already use data parts.
   */
  const handleDirectUrlSubmission = useCallback(async (url: string, originalText: string) => {
    setIsDirectProcessing(true)
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
        // Fall back to LLM path on API error
        sendMessageToApi({ text: originalText })
        return
      }

      const data = await res.json()
      const taskId = data.task_id
      const messages = Array.isArray(data.messages) ? (data.messages as ChatUIMessage[]) : null

      if (!taskId || !messages) {
        sendMessageToApi({ text: originalText })
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
      // Network error: fall back to LLM path
      sendMessageToApi({ text: originalText })
    } finally {
      setIsDirectProcessing(false)
    }
  }, [sendMessageToApi, setMessages, onChatStarted, effectiveThreadId, activeTaskIdRef])

  return { isDirectProcessing, handleDirectUrlSubmission }
}
