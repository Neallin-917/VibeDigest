import { z } from 'zod'
import type { UIMessage } from 'ai'

export const messageMetadataSchema = z.object({
  createdAt: z.union([z.string(), z.date()]).optional(),
  runtime: z.enum(['api', 'codex_local']).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  modelTier: z.enum(['smart', 'fast']).optional(),
  reasoningEffort: z.string().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  actualModel: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  agentTurnId: z.string().optional(),
  agentState: z.enum(['running', 'waiting_task', 'finalizing', 'completed', 'failed', 'cancelled']).optional(),
  errorCode: z.literal('quota_exceeded').optional(),
})

export type ChatMessageMetadata = z.infer<typeof messageMetadataSchema>

export const taskLifecycleStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])
export type TaskLifecycleStatus = z.infer<typeof taskLifecycleStatusSchema>

export const taskStatusDataSchema = z.object({
  taskId: z.string(),
  status: taskLifecycleStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  videoTitle: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  errorMessage: z.string().optional(),
})

// Older completed demo threads persisted this lightweight progress marker.
// Keep it readable so a follow-up can validate its complete conversation history.
export const legacyTaskReferenceDataSchema = z.object({
  taskId: z.string(),
})

export const chatDataSchemas = {
  'task-status': taskStatusDataSchema,
  'task-progress': legacyTaskReferenceDataSchema,
  'task-plan': legacyTaskReferenceDataSchema,
} as const

export type ChatUIDataParts = {
  'task-status': z.infer<typeof taskStatusDataSchema>
  'task-progress': z.infer<typeof legacyTaskReferenceDataSchema>
  'task-plan': z.infer<typeof legacyTaskReferenceDataSchema>
}

// Read compatibility for saved messages only. New Agents never expose raw tool
// output to the browser, and no server-side legacy tool implementation is kept.
export type ChatUITools = {
  get_task_status: { input: { taskId: string }; output: unknown }
  get_task_outputs: { input: { taskId: string; kinds?: string[]; query?: string }; output: unknown }
}

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatUIDataParts, ChatUITools>
export type ChatUIMessagePart = ChatUIMessage['parts'][number]
export type StoredChatMessageRow = {
  id: string
  role: unknown
  content: unknown
  created_at: string
  metadata?: unknown
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
  return role === 'user' || role === 'assistant'
}

export function createTextPart(text: string): ChatUIMessagePart {
  return { type: 'text', text }
}

export function createUserTextMessage(id: string, text: string): ChatUIMessage {
  return {
    id,
    role: 'user',
    parts: [createTextPart(text)],
    metadata: { createdAt: new Date().toISOString() },
  }
}

export function createTaskDataParts(params: {
  messageId: string
  taskId: string
  status?: TaskLifecycleStatus
  progress?: number
  videoTitle?: string
  thumbnailUrl?: string
  videoUrl?: string
  errorMessage?: string
}): ChatUIMessage {
  const {
    messageId,
    taskId,
    status = 'pending',
    progress = 0,
    videoTitle,
    thumbnailUrl,
    videoUrl,
    errorMessage,
  } = params

  return {
    id: messageId,
    role: 'assistant',
    parts: [
      {
        type: 'data-task-status',
        id: `task-status-${taskId}`,
        data: {
          taskId,
          status,
          progress,
          videoTitle,
          thumbnailUrl,
          videoUrl,
          errorMessage,
        },
      },
    ],
    metadata: { createdAt: new Date().toISOString() },
  }
}

export function isStrictStoredMessageRow(row: StoredChatMessageRow): boolean {
  return isStoredMessageRole(row.role) && Array.isArray(row.content) && row.content.length > 0 && hasOnlyTypedParts(row.content)
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
    metadata: isRecord(row.metadata)
      ? { ...row.metadata, createdAt: row.created_at }
      : { createdAt: row.created_at },
  }
}
