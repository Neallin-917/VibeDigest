import type { InferUITools, UIMessage } from 'ai'
import type { TaskStatusOutput } from '@/components/chat/tools/types'
import type { ChatToolSet } from '@/app/api/chat/tools'

export type ChatMessageMetadata = {
  createdAt?: string | Date
}

export type ChatUITools = InferUITools<ChatToolSet>

export type ChatUIMessage = UIMessage<ChatMessageMetadata, never, ChatUITools>
export type ChatUIMessagePart = ChatUIMessage['parts'][number]
export type StoredChatMessageRow = {
  id: string
  role: unknown
  content: unknown
  created_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasPartType(value: unknown): value is { type: string } {
  return isRecord(value) && typeof value.type === 'string'
}

function hasOnlyTypedParts(value: unknown): value is ChatUIMessagePart[] {
  return Array.isArray(value) && value.every(hasPartType)
}

function isStoredMessageRole(role: unknown): role is ChatUIMessage['role'] {
  return role === 'user' || role === 'assistant' || role === 'system'
}

export function createTextPart(text: string): ChatUIMessagePart {
  return { type: 'text', text }
}

export function createUserTextMessage(id: string, text: string): ChatUIMessage {
  return {
    id,
    role: 'user',
    parts: [createTextPart(text)],
  }
}

export function createTaskStatusMessage(params: {
  messageId: string
  toolCallId: string
  taskId: string
  status?: TaskStatusOutput['status']
  progress?: number
}): ChatUIMessage {
  const { messageId, toolCallId, taskId, status = 'pending', progress = 0 } = params

  return {
    id: messageId,
    role: 'assistant',
    parts: [
      {
        type: 'tool-get_task_status',
        toolCallId,
        state: 'output-available',
        input: { taskId },
        output: {
          taskId,
          status,
          progress,
          video_title: undefined,
          thumbnail_url: undefined,
          video_url: undefined,
          error_message: undefined,
          created_at: undefined,
          updated_at: undefined,
        },
      },
    ],
  }
}

export function isStrictStoredMessageRow(row: StoredChatMessageRow): boolean {
  return isStoredMessageRole(row.role) && hasOnlyTypedParts(row.content)
}

export function toStoredChatUIMessage(row: StoredChatMessageRow): ChatUIMessage {
  if (!isStoredMessageRole(row.role)) {
    throw new Error(`Unsupported stored chat role: ${String(row.role)}`)
  }

  if (!hasOnlyTypedParts(row.content)) {
    throw new Error(`Stored chat message ${row.id} does not use UIMessage.parts`)
  }

  return {
    id: row.id,
    role: row.role,
    parts: row.content,
    metadata: { createdAt: row.created_at },
  }
}
