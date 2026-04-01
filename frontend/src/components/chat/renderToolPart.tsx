import { getToolName, isToolUIPart } from 'ai'
import {
  CreateTaskTool,
  GetTaskOutputsTool,
  GetTaskStatusTool,
  PreviewVideoTool,
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
    case 'create_task':
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
  onOpenPanel?: (taskId: string) => void
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

    case 'create_task':
      return (
        <CreateTaskTool
          key={resolvedToolCallId}
          toolCallId={resolvedToolCallId}
          state={state}
          input={args as { video_url?: string; videoUrl?: string; url?: string } | undefined}
          output={result as {
            taskId?: string
            status?: string
            message?: string
            videoUrl?: string
            error?: string
            details?: string | Record<string, unknown>
          } | undefined}
          errorText={errorText}
          onViewClick={onOpenPanel}
        />
      )

    case 'preview_video':
      return (
        <PreviewVideoTool
          key={resolvedToolCallId}
          toolCallId={resolvedToolCallId}
          state={state}
          input={args as { video_url?: string; videoUrl?: string; url?: string } | undefined}
          output={result as {
            title?: string
            thumbnail?: string
            duration?: string
            channel?: string
            error?: string
            details?: string | Record<string, unknown>
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
