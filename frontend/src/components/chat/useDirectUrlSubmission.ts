import { useState, useCallback } from 'react'
import { UIMessage } from 'ai'
import { v4 as uuidv4 } from 'uuid'

export function useDirectUrlSubmission(deps: {
  sendMessageToApi: (params: { text: string }) => void
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>
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

      const userMsg: UIMessage = {
        id: userMsgId,
        role: 'user',
        parts: [{ type: 'text', text: originalText }],
      }

      // The `type: 'tool-get_task_status'` hack is required because the UIMessage
      // parts type system only allows literal string types like 'text'. We need to
      // inject a synthetic tool output part so the existing GetTaskStatusTool UI
      // component picks it up and renders the task status card. Casting through
      // `unknown` bypasses the type narrowing at the cost of type safety here.
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
  }, [sendMessageToApi, setMessages, onOpenPanel, onChatStarted, effectiveThreadId, activeTaskIdRef])

  return { isDirectProcessing, handleDirectUrlSubmission }
}
