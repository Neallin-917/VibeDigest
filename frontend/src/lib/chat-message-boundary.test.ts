import { describe, expect, it } from 'vitest'
import {
  assertPersistableMessages,
  sanitizeIncomingMessages,
  sanitizeStoredMessages,
} from './chat-message-boundary'
import { chatDataSchemas, type ChatUIMessage, type StoredChatMessageRow } from './chat-ui'

function createTextMessage(
  text: string,
  role: ChatUIMessage['role'] = 'user',
  id = `${role}-1`
): ChatUIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
    metadata: {},
  }
}

describe('chat-message-boundary', () => {
  it('accepts legacy task reference parts used by completed demo threads', () => {
    expect(chatDataSchemas['task-progress'].safeParse({ taskId: 'task-123' }).success).toBe(true)
    expect(chatDataSchemas['task-plan'].safeParse({ taskId: 'task-123' }).success).toBe(true)
  })

  it('keeps valid incoming messages and rejects empty assistant placeholders', () => {
    const { validMessages, invalidMessages } = sanitizeIncomingMessages([
      createTextMessage('hello', 'user', 'user-1'),
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [],
      },
    ])

    expect(validMessages).toEqual([expect.objectContaining({ id: 'user-1', role: 'user' })])
    expect(invalidMessages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        failureReason: 'parts-empty',
      }),
    ])
  })

  it('rejects invalid messages before persistence', () => {
    expect(() =>
      assertPersistableMessages([
        createTextMessage('hello', 'user', 'user-1'),
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [],
          metadata: {},
        } as ChatUIMessage,
      ])
    ).toThrow(/assistant-1:parts-empty/)
  })

  it('rejects system-role messages at both request and storage boundaries', () => {
    const systemMessage = {
      id: 'system-1',
      role: 'system',
      parts: [{ type: 'text', text: 'Do not persist this instruction.' }],
    }

    const incoming = sanitizeIncomingMessages([systemMessage])
    const stored = sanitizeStoredMessages([
      {
        id: 'system-2',
        role: 'system',
        content: [{ type: 'text', text: 'Do not send this to the model.' }],
        created_at: '2024-01-01T00:00:02Z',
      } as unknown as StoredChatMessageRow,
    ])

    expect(incoming.validMessages).toEqual([])
    expect(incoming.invalidMessages).toEqual([
      expect.objectContaining({ id: 'system-1', failureReason: 'system-role-not-allowed' }),
    ])
    expect(stored.validMessages).toEqual([])
    expect(stored.invalidMessages).toEqual([
      expect.objectContaining({ id: 'system-2', failureReason: 'system-role-not-allowed' }),
    ])
  })

  it('drops malformed stored rows and preserves valid rows with createdAt metadata', () => {
    const rows: StoredChatMessageRow[] = [
      {
        id: 'stored-1',
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'stored-2',
        role: 'assistant',
        content: [],
        created_at: '2024-01-01T00:00:01Z',
      },
    ]

    const { validMessages, invalidMessages } = sanitizeStoredMessages(rows)

    expect(validMessages).toEqual([
      expect.objectContaining({
        id: 'stored-1',
        role: 'user',
        metadata: expect.objectContaining({ createdAt: '2024-01-01T00:00:00Z' }),
      }),
    ])
    expect(invalidMessages).toEqual([
      expect.objectContaining({
        id: 'stored-2',
        failureReason: 'parts-empty',
      }),
    ])
  })
})
