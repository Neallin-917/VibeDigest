import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { createTaskStatusMessage, createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui'

export function useDirectUrlSubmission(deps: {
  sendMessageToApi: (params: { text: string }) => void
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>
  onOpenPanel?: (taskId: string) => void
  onChatStarted?: (threadId: string) => void
  effectiveThreadId: string
  activeTaskIdRef: React.RefObject<string | null | undefined>
}): {
  isDirectProcessing: boolean
  handleDirectUrlSubmission: (url: string, originalText: string) => Promise<void>
} {
  const { sendMessageToApi, setMessages, onOpenPanel, onChatStarted, effectiveThreadId, activeTaskIdRef } = deps

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

      const userMsg = createUserTextMessage(userMsgId, originalText)
      const assistantMsg = createTaskStatusMessage({
        messageId: assistantMsgId,
        toolCallId,
        taskId,
      })

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
  }, [sendMessageToApi, setMessages, onOpenPanel, onChatStarted, effectiveThreadId, activeTaskIdRef])

  return { isDirectProcessing, handleDirectUrlSubmission }
}
