import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { env } from '@/env'
import type { ChatUIMessage } from '@/lib/chat-ui'

vi.mock('@/env', () => ({
  env: {
    AI_SDK_DEBUG: '0',
    BACKEND_API_URL: 'http://localhost:8000',
    SERVER_BACKEND_URL: 'http://localhost:8000',
    MODEL_ALIAS_SMART: undefined,
    MODEL_ALIAS_FAST: undefined,
    OPENAI_BASE_URL: undefined,
    OPENAI_API_KEY: undefined,
    OPENROUTER_BASE_URL: undefined,
    OPENROUTER_API_KEY: undefined,
    NEXT_PUBLIC_E2E_MOCK: '0',
  },
}))

const {
  mockGetUser,
  mockGetSession,
  mockFrom,
  mockStreamText,
  mockConvertToModelMessages,
  mockValidateUIMessages,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockGenerateText,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
  mockStreamText: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockValidateUIMessages: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  mockGenerateText: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    from: mockFrom,
  })),
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as any),
    ToolLoopAgent: class {
      constructor(options: unknown) {
        mockStreamText(options)
      }

      stream = vi.fn().mockResolvedValue({ stream: new ReadableStream() })
    },
    convertToModelMessages: mockConvertToModelMessages,
    pruneMessages: vi.fn(({ messages }) => messages),
    validateUIMessages: mockValidateUIMessages,
    toUIMessageStream: vi.fn(() => new ReadableStream()),
    createUIMessageStream: mockCreateUIMessageStream,
    createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
    generateText: mockGenerateText,
  }
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ id: model })),
  })),
}))

vi.mock('@/lib/llm-config', () => ({
  createProviderClient: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ id: model })),
  })),
}))

import { POST } from './route'

const originalFetch = global.fetch

function createMessage(text: string): ChatUIMessage {
  return {
    id: 'user-message-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

describe('POST /api/chat archive restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    ;(env as any).MODEL_ALIAS_SMART = undefined
    ;(env as any).MODEL_ALIAS_FAST = undefined
    ;(env as any).OPENAI_BASE_URL = undefined
    ;(env as any).OPENAI_API_KEY = undefined
    ;(env as any).OPENROUTER_BASE_URL = undefined
    ;(env as any).OPENROUTER_API_KEY = undefined

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' }, access_token: 'valid-token' } },
      error: null,
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ active_provider: 'custom' }),
    } as Response)

    mockValidateUIMessages.mockImplementation(async ({ messages }: { messages: ChatUIMessage[] }) => messages)
    mockConvertToModelMessages.mockResolvedValue([])
    mockCreateUIMessageStream.mockImplementation(({ execute, ...options }: any) => {
      void Promise.resolve(execute({
        writer: {
          write: vi.fn(),
          merge: vi.fn(),
          onError: vi.fn(),
        },
      })).catch(() => undefined)
      return { options }
    })
    mockCreateUIMessageStreamResponse.mockImplementation(() => new Response('mock stream'))
    mockStreamText.mockImplementation(() => undefined)
    mockGenerateText.mockResolvedValue({ text: 'Generated Title' })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('restores an archived thread before continuing the chat', async () => {
    const restoreEqUserMock = vi.fn().mockResolvedValue({ error: null })
    const restoreEqIdMock = vi.fn().mockReturnValue({ eq: restoreEqUserMock })
    const restoreUpdateMock = vi.fn().mockReturnValue({ eq: restoreEqIdMock })
    const selectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        title: 'Archived thread',
        status: 'archived',
      },
      error: null,
    })
    const selectEqUserMock = vi.fn().mockReturnValue({ single: selectSingleMock })
    const selectEqIdMock = vi.fn().mockReturnValue({ eq: selectEqUserMock })

    mockFrom.mockImplementation(((table: string) => {
      if (table === 'chat_threads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: selectEqIdMock,
          }),
          update: restoreUpdateMock,
        }
      }

      if (table === 'chat_messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }
      }

      return {
        select: vi.fn(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn(),
      }
    }) as any)

    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: createMessage('Continue this conversation'),
        threadId: 'thread-1',
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(restoreUpdateMock).toHaveBeenCalledWith({
      status: 'active',
      updated_at: expect.any(String),
    })
    expect(restoreEqIdMock).toHaveBeenCalledWith('id', 'thread-1')
    expect(restoreEqUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(selectEqIdMock).toHaveBeenCalledWith('id', 'thread-1')
    expect(selectEqUserMock).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
