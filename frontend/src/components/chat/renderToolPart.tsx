import { getToolName, isToolUIPart } from 'ai'
import {
  GetTaskOutputsTool,
  GetTaskStatusTool,
  UnknownTool,
} from './tools'
import type { ChatUIMessagePart } from '@/lib/chat-ui'

export function shouldRenderToolPart(part: ChatUIMessagePart) {
  if (!isToolUIPart(part)) {
    return false
  }

  const toolName = getToolName(part)
  const errorText = 'errorText' in part ? part.errorText : undefined
  const output = 'output' in part ? part.output : undefined
  const hasError =
    Boolean(errorText) ||
    (typeof output === 'object' &&
      output !== null &&
      'error' in output &&
      typeof (output as { error?: unknown }).error === 'string')

  switch (toolName) {
    case 'get_task_status':
      return hasError
    default:
      return true
  }
}

// Helper function to render tool parts using AI SDK v6 standard UIMessage types
export function renderToolPart(
  part: ChatUIMessagePart,
  index: number,
) {
  if (!isToolUIPart(part) || !shouldRenderToolPart(part)) {
    return null
  }

  const toolCallId = part.toolCallId
  const resolvedToolCallId = toolCallId ?? `tool-${index}`
  const state = part.state ?? 'input-available'
  const args = part.input
  const result = 'output' in part ? part.output : undefined
  const errorText = 'errorText' in part ? part.errorText : undefined
  const toolName = getToolName(part)

  switch (toolName) {
    case 'get_task_status':
      return (
        <GetTaskStatusTool
          key={resolvedToolCallId}
          toolCallId={resolvedToolCallId}
          state={state}
          input={args as { taskId: string } | undefined}
          output={result as {
            taskId: string
            status: 'pending' | 'processing' | 'completed' | 'failed'
            progress?: number
            video_title?: string
            thumbnail_url?: string
            video_url?: string
            error_message?: string
            error?: string
          } | undefined}
          errorText={errorText}
        />
      )

    case 'get_task_outputs':
      return (
        <GetTaskOutputsTool
          key={resolvedToolCallId}
          toolCallId={resolvedToolCallId}
          state={state}
          input={args as { taskId: string; kinds?: string[] } | undefined}
          output={result as {
            taskId: string
            outputs: { kind: string; content: string; status: string }[]
            count: number
            error?: string
          } | undefined}
          errorText={errorText}
        />
      )

    default:
      return (
        <UnknownTool
          key={resolvedToolCallId}
          toolName={toolName}
          toolCallId={resolvedToolCallId}
          state={state}
          input={args}
          output={result}
          errorText={errorText}
        />
      )
  }
}
