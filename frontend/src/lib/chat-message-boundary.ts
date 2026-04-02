import type { ChatUIMessage, StoredChatMessageRow } from '@/lib/chat-ui'

type ChatMessageFailureReason =
  | 'missing-id'
  | 'invalid-role'
  | 'parts-not-array'
  | 'parts-empty'
  | 'part-missing-type'

type InvalidChatMessageBase = {
  id: string | null
  role: unknown
  failureReason: ChatMessageFailureReason
}

export type InvalidChatUIMessage = InvalidChatMessageBase

export type InvalidStoredChatMessage = InvalidChatMessageBase & {
  createdAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidRole(role: unknown): role is ChatUIMessage['role'] {
  return role === 'user' || role === 'assistant' || role === 'system'
}

function getFailureReason(candidate: {
  id: unknown
  role: unknown
  parts: unknown
}): ChatMessageFailureReason | null {
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return 'missing-id'
  if (!isValidRole(candidate.role)) return 'invalid-role'
  if (!Array.isArray(candidate.parts)) return 'parts-not-array'
  if (candidate.parts.length === 0) return 'parts-empty'
  if (!candidate.parts.every((part) => isRecord(part) && typeof part.type === 'string')) {
    return 'part-missing-type'
  }
  return null
}

function toMetadata(metadata: unknown, fallbackCreatedAt?: string): ChatUIMessage['metadata'] {
  const normalized = isRecord(metadata) ? { ...metadata } : {}
  if (fallbackCreatedAt) {
    normalized.createdAt = fallbackCreatedAt
  }
  return normalized
}

export function sanitizeIncomingMessages(messages: unknown[]): {
  validMessages: ChatUIMessage[]
  invalidMessages: InvalidChatUIMessage[]
} {
  const validMessages: ChatUIMessage[] = []
  const invalidMessages: InvalidChatUIMessage[] = []

  messages.forEach((message) => {
    const candidate = isRecord(message) ? message : {}
    const failureReason = getFailureReason({
      id: candidate.id,
      role: candidate.role,
      parts: candidate.parts,
    })

    if (failureReason) {
      invalidMessages.push({
        id: typeof candidate.id === 'string' ? candidate.id : null,
        role: candidate.role,
        failureReason,
      })
      return
    }

    validMessages.push({
      id: candidate.id as string,
      role: candidate.role as ChatUIMessage['role'],
      parts: candidate.parts as ChatUIMessage['parts'],
      metadata: toMetadata(candidate.metadata),
    })
  })

  return { validMessages, invalidMessages }
}

export function sanitizeStoredMessages(rows: StoredChatMessageRow[]): {
  validMessages: ChatUIMessage[]
  invalidMessages: InvalidStoredChatMessage[]
} {
  const validMessages: ChatUIMessage[] = []
  const invalidMessages: InvalidStoredChatMessage[] = []

  rows.forEach((row) => {
    const failureReason = getFailureReason({
      id: row.id,
      role: row.role,
      parts: row.content,
    })

    if (failureReason) {
      invalidMessages.push({
        id: row.id,
        role: row.role,
        createdAt: row.created_at,
        failureReason,
      })
      return
    }

    validMessages.push({
      id: row.id,
      role: row.role as ChatUIMessage['role'],
      parts: row.content as ChatUIMessage['parts'],
      metadata: toMetadata(row.metadata, row.created_at),
    })
  })

  return { validMessages, invalidMessages }
}

export function assertPersistableMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  const { validMessages, invalidMessages } = sanitizeIncomingMessages(messages)

  if (invalidMessages.length > 0) {
    const details = invalidMessages
      .map((item) => `${item.id ?? 'unknown'}:${item.failureReason}`)
      .join(', ')
    throw new Error(`Refusing to persist invalid chat messages: ${details}`)
  }

  return validMessages
}

export function logInvalidChatMessages(params: {
  source: 'request' | 'history' | 'persistence' | 'thread-read'
  threadId?: string
  invalidMessages: Array<InvalidChatUIMessage | InvalidStoredChatMessage>
}) {
  const { source, threadId, invalidMessages } = params
  if (invalidMessages.length === 0) return

  const logger = source === 'persistence' ? console.error : console.warn
  invalidMessages.forEach((item) => {
    logger('[ChatMessageBoundary] Invalid chat message dropped', {
      source,
      threadId: threadId ?? null,
      messageId: item.id,
      role: item.role ?? null,
      failureReason: item.failureReason,
      createdAt: 'createdAt' in item ? item.createdAt ?? null : null,
    })
  })
}
