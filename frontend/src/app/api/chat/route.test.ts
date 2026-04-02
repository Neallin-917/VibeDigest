import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'
import { env } from '@/env'
import type { ChatUIMessage } from '@/lib/chat-ui'

// Mock env before importing route
vi.mock('@/env', () => ({
    env: {
        AI_SDK_DEBUG: '0',
        BACKEND_API_URL: 'http://localhost:8000',
        MODEL_ALIAS_SMART: undefined,
        MODEL_ALIAS_FAST: undefined,
        OPENAI_BASE_URL: undefined,
        OPENAI_API_KEY: undefined,
        OPENROUTER_BASE_URL: undefined,
        OPENROUTER_API_KEY: undefined,
        NEXT_PUBLIC_E2E_MOCK: '0',
    }
}))

// --- Mocks ---

// 1. Mock Supabase Server Client
// --- Mocks ---

const {
    mockGetUser,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockEq,
    mockIn,
    mockDelete,
    mockSingle,
    mockOrder,
    mockFrom,
    mockStreamText,
    mockConvertToModelMessages,
    mockValidateUIMessages,
    mockGetSession,
    mockGenerateText,
    mockUpsert,
    mockCreateUIMessageStream,
    mockCreateUIMessageStreamResponse,
} = vi.hoisted(() => {
    return {
        // Supabase mocks
        mockGetUser: vi.fn(),
        mockGetSession: vi.fn(),
        mockSelect: vi.fn(),
        mockInsert: vi.fn(),
        mockUpdate: vi.fn(),
        mockUpsert: vi.fn(),
        mockEq: vi.fn(),
        mockIn: vi.fn(),
        mockDelete: vi.fn(),
        mockSingle: vi.fn(),
        mockOrder: vi.fn(),
        mockFrom: vi.fn(),

        // AI SDK mocks
        mockStreamText: vi.fn(),
        mockConvertToModelMessages: vi.fn(),
        mockValidateUIMessages: vi.fn(),
        mockGenerateText: vi.fn(),
        mockCreateUIMessageStream: vi.fn(),
        mockCreateUIMessageStreamResponse: vi.fn(),
    }
})

// Chainable mock implementation (applied after hoisting)
mockFrom.mockImplementation((() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    upsert: mockUpsert,
    delete: mockDelete,
})) as any)

// Default successful responses (Moved to beforeEach)

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(() => ({
        auth: {
            getUser: mockGetUser,
            getSession: mockGetSession
        },
        from: mockFrom
    }))
}))

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...(actual as any),
        streamText: mockStreamText,
        convertToModelMessages: mockConvertToModelMessages,
        validateUIMessages: mockValidateUIMessages,
        generateText: mockGenerateText,
        createUIMessageStream: mockCreateUIMessageStream,
        createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
    }
})

// 3. Mock OpenAI SDK
vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn(() => ({
        chat: vi.fn((model: string) => ({ id: model }))
    }))
}))

// 4. Mock llm-config
vi.mock('@/lib/llm-config', () => ({
    createProviderClient: vi.fn(() => ({
        chat: vi.fn((model: string) => ({ id: model }))
    }))
}))

const originalFetch = global.fetch
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleLogSpy: ReturnType<typeof vi.spyOn>

function createTextMessage(
    text: string,
    role: ChatUIMessage['role'] = 'user',
    id = `${role}-${Math.random().toString(36).slice(2, 10)}`
): ChatUIMessage {
    return {
        id,
        role,
        parts: [{ type: 'text', text }],
    }
}

function getLastUIStreamOptions() {
    return mockCreateUIMessageStream.mock.calls.at(-1)?.[0]
}

// --- Tests ---

describe('POST /api/chat', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        ;(env as any).MODEL_ALIAS_SMART = undefined
        ;(env as any).MODEL_ALIAS_FAST = undefined
        ;(env as any).OPENAI_BASE_URL = undefined
        ;(env as any).OPENAI_API_KEY = undefined
        ;(env as any).OPENROUTER_BASE_URL = undefined
        ;(env as any).OPENROUTER_API_KEY = undefined

        mockFrom.mockImplementation((() => ({
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            upsert: mockUpsert,
            delete: mockDelete,
        })) as any)

        // Default Auth: User is logged in
        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id' } },
            error: null
        })
        mockGetSession.mockResolvedValue({
            data: { session: { user: { id: 'test-user-id' }, access_token: 'valid-token' } },
            error: null
        })

        // Setup chain returns
        mockSelect.mockImplementation(() => ({
            eq: vi.fn(() => ({
                in: mockIn,
                single: mockSingle,
                order: mockOrder
            })),
            in: mockIn,
            single: mockSingle,
            order: mockOrder
        }))
        mockUpdate.mockReturnValue({
            eq: vi.fn().mockResolvedValue({})
        })
        mockEq.mockImplementation(() => {
            return { single: mockSingle, order: mockOrder };
        })
        mockIn.mockResolvedValue({ data: [], error: null })
        mockDelete.mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null })
        })

        // Default successful responses
        mockSingle.mockResolvedValue({ data: null, error: null })
        mockOrder.mockResolvedValue({ data: [], error: null })
        mockInsert.mockResolvedValue({ error: null })
        mockUpsert.mockResolvedValue({ error: null })
        mockGenerateText.mockResolvedValue({ text: 'Generated Title' })
        mockCreateUIMessageStream.mockImplementation(({ execute, ...options }: any) => {
            void execute({
                writer: {
                    write: vi.fn(),
                    merge: vi.fn(),
                    onError: vi.fn(),
                },
            })
            return { options }
        })
        mockCreateUIMessageStreamResponse.mockImplementation(() => new Response('mock stream'))

        ;(global as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                active_provider: 'custom',
                providers: [
                    {
                        provider: 'custom',
                        defaults: {
                            smart: 'gemini-3-pro-preview',
                            fast: 'gemini-3-flash-preview'
                        }
                    }
                ]
            })
        })

        // Default: Mock streamText response
        mockStreamText.mockReturnValue({
            toUIMessageStream: vi.fn().mockReturnValue(new ReadableStream()),
        })

        mockConvertToModelMessages.mockResolvedValue([])
        mockValidateUIMessages.mockImplementation(async ({ messages }: { messages: ChatUIMessage[] }) => messages)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
        consoleWarnSpy.mockRestore()
        consoleLogSpy.mockRestore()
        ;(global as any).fetch = originalFetch
    })

    it('returns 401 if user is not authenticated', async () => {
        // Setup: No user
        mockGetUser.mockResolvedValue({ data: { user: null }, error: 'No session' })
        mockGetSession.mockResolvedValue({ data: { session: null }, error: 'No session' })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message: createTextMessage('hello') })
        })

        const res = await POST(req)

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual(expect.objectContaining({ error: 'Unauthorized' }))
    })

    it('calls streamText with correct model and messages', async () => {
        // Setup: Thread lookup returns nothing (new thread)
        mockEq.mockReturnValue({ single: mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Hello AI'),
                threadId: 'thread-123'
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        expect(mockStreamText).toHaveBeenCalled()

        // Verify system prompt contains default instruction
        const callArgs = mockStreamText.mock.calls[0][0]
        expect(callArgs.system).toContain('You are VibeDigest Assistant')
        expect(callArgs.model.id).toBe('google/gemini-3-pro-preview')
    })

    it('validates persisted tool messages before converting them for the model', async () => {
        const persistedMessages = [
            {
                id: 'msg-1',
                role: 'user',
                content: [{ type: 'text', text: 'Analyze this video' }],
                created_at: '2024-01-01T00:00:00Z',
            },
            {
                id: 'msg-2',
                role: 'assistant',
                content: [
                    {
                        type: 'tool-create_task',
                        toolCallId: 'tc-1',
                        state: 'output-available',
                        input: { video_url: 'https://example.com/video' },
                        output: { taskId: 'task-1' },
                    },
                ],
                created_at: '2024-01-01T00:00:01Z',
            },
        ]

        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'thread-123', title: 'New Chat' },
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: persistedMessages,
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate,
                upsert: mockUpsert,
            }
        }) as any)

        mockValidateUIMessages.mockImplementationOnce(async ({ messages, tools }) => {
            expect(tools).toEqual(expect.objectContaining({
                get_task_status: expect.any(Object),
                get_task_outputs: expect.any(Object),
                create_task: expect.any(Object),
                preview_video: expect.any(Object),
            }))

            return messages
        })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('How is the progress?'),
                threadId: 'thread-123',
            }),
        })

        await POST(req)

        expect(mockValidateUIMessages).toHaveBeenCalledTimes(1)
        expect(mockConvertToModelMessages).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'msg-1', role: 'user' }),
            expect.objectContaining({
                id: 'msg-2',
                role: 'assistant',
                parts: [
                    expect.objectContaining({
                        type: 'tool-create_task',
                        toolCallId: 'tc-1',
                    }),
                ],
            }),
            expect.objectContaining({ role: 'user' }),
        ])

        const uiStreamOptions = getLastUIStreamOptions()
        expect(uiStreamOptions.originalMessages[1].parts[0]).toEqual(
            expect.objectContaining({
                type: 'tool-create_task',
                toolCallId: 'tc-1',
            })
        )
    })

    it('filters invalid historical messages instead of trying to coerce them', async () => {
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'thread-123', title: 'New Chat' },
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: [
                                    {
                                        id: 'legacy-1',
                                        role: 'assistant',
                                        content: 'old plain text payload',
                                        created_at: '2024-01-01T00:00:00Z',
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate,
                upsert: mockUpsert,
            }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('fresh message'),
                threadId: 'thread-123',
            }),
        })

        await POST(req)

        expect(mockValidateUIMessages).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [expect.objectContaining({ id: expect.any(String), role: 'user' })],
            })
        )
        expect(mockConvertToModelMessages).toHaveBeenCalledWith([
            expect.objectContaining({
                role: 'user',
                parts: [{ type: 'text', text: 'fresh message' }],
            }),
        ])
    })

    it('filters persisted assistant placeholders with empty parts before validation', async () => {
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { id: 'thread-123', title: 'New Chat' },
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: [
                                    {
                                        id: 'msg-1',
                                        role: 'user',
                                        content: [{ type: 'text', text: 'https://www.youtube.com/watch?v=abc' }],
                                        created_at: '2024-01-01T00:00:00Z',
                                    },
                                    {
                                        id: 'msg-2',
                                        role: 'assistant',
                                        content: [],
                                        created_at: '2024-01-01T00:00:01Z',
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                }
            }

            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate,
                upsert: mockUpsert,
            }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('hi', 'user', 'fresh-user'),
                threadId: 'thread-123',
            }),
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        const validatedInput = mockValidateUIMessages.mock.calls[0][0]
        expect(validatedInput.messages).toEqual([
            expect.objectContaining({ id: 'msg-1', role: 'user' }),
            expect.objectContaining({ id: 'fresh-user', role: 'user' }),
        ])
        expect(validatedInput.messages).toHaveLength(2)
    })

    it('returns 400 when the incoming request message is not persistable', async () => {
        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: {
                    id: 'assistant-placeholder',
                    role: 'assistant',
                    parts: [],
                },
                threadId: 'thread-123',
            }),
        })

        const res = await POST(req)
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body).toEqual(
            expect.objectContaining({
                error: 'Invalid chat message',
                details: expect.stringContaining('parts-empty'),
            })
        )
        expect(mockValidateUIMessages).not.toHaveBeenCalled()
    })

    it('injects RAG context when taskId is provided', async () => {
        const taskId = 'task-123'

        // Setup: Task lookup success
        // We need to carefully mock the chain for specific tables

        // Reset specific mock implementations for this test
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'tasks') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    video_title: 'Test Video',
                                    video_url: 'http://yt.com/1',
                                    status: 'completed',
                                    progress: 100
                                },
                                error: null
                            })
                        })
                    })
                }
            }
            if (table === 'task_outputs') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({
                                data: [
                                    { kind: 'summary', content: 'This is a summary.', status: 'completed' },
                                    { kind: 'script', content: 'This is a transcript.', status: 'completed' }
                                ],
                                error: null
                            })
                        })
                    })
                }
            }
            // Default fallback
            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate
            }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('What is the video about?'),
                threadId: 'thread-123',
                taskId: taskId
            })
        })

        await POST(req)

        const callArgs = mockStreamText.mock.calls[0][0]
        expect(callArgs.system).toContain('CURRENT VIDEO CONTEXT')
        expect(callArgs.system).toContain('Test Video')
        expect(callArgs.system).toContain('This is a summary.')
    })

    it('persists new thread if it does not exist', async () => {
        // Setup: Thread lookup returns "Not Found"
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                        })
                    }),
                    insert: mockInsert,
                    update: mockUpdate,
                }
            }
            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ data: null }),
                            order: mockOrder
                        })
                    }),
                    insert: mockInsert,
                    upsert: mockUpsert
                }
            }
            return { select: mockSelect, insert: mockInsert, upsert: mockUpsert }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('New Thread'),
                threadId: 'new-thread-id'
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()
        
        await uiStreamOptions.onFinish({ 
            messages: [createTextMessage('New Thread', 'user', 'msg-1')] 
        })

        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 'new-thread-id',
            user_id: 'test-user-id',
            title: 'New Chat'
        }))
    })

    it('persists new thread with task_id when taskId is provided', async () => {
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                        })
                    }),
                    insert: mockInsert,
                    update: mockUpdate,
                }
            }
            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ data: null }),
                            order: mockOrder
                        })
                    }),
                    insert: mockInsert,
                    upsert: mockUpsert
                }
            }
            return { select: mockSelect, insert: mockInsert, upsert: mockUpsert }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Bind this thread'),
                threadId: 'new-thread-id',
                taskId: 'task-abc'
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()
        
        await uiStreamOptions.onFinish({ 
            messages: [createTextMessage('Bind this thread', 'user', 'msg-1')] 
        })

        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 'new-thread-id',
            user_id: 'test-user-id',
            title: 'New Chat',
            task_id: 'task-abc'
        }))
    })

    it('uses fast model for short follow-up with taskId', async () => {
        ;(env as any).OPENAI_BASE_URL = 'http://localhost:8317/v1'

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('它说领导力的时候有举例吗'),
                threadId: 'thread-123',
                taskId: 'task-123'
            })
        })

        await POST(req)

        const callArgs = mockStreamText.mock.calls.at(-1)?.[0]
        expect(callArgs?.model?.id).toBe('gemini-3-flash-preview')
    })

    it('uses default openrouter fast model for short follow-up when provider is unset', async () => {
        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('它有提到价格吗'),
                threadId: 'thread-123',
                taskId: 'task-123'
            })
        })

        await POST(req)

        const callArgs = mockStreamText.mock.calls.at(-1)?.[0]
        expect(callArgs?.model?.id).toBe('google/gemini-3-flash-preview')
    })

    it('returns 503 when createProviderClient throws Missing API Key', async () => {
        const { createProviderClient } = await import('@/lib/llm-config')
        vi.mocked(createProviderClient).mockImplementationOnce(() => {
            throw new Error("Missing API Key for provider: 'custom'. Set OPENAI_API_KEY in the environment.")
        })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Hello'),
                threadId: 'thread-123'
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(503)
        const body = await res.json()
        expect(body.error).toBe('Service Configuration Error')
        expect(body.details).toContain('credentials are missing or invalid')
    })

    it('returns 502 when LLM provider is unreachable', async () => {
        mockStreamText.mockImplementation(() => {
            throw new Error('Failed after 3 attempts. Last error: Cannot connect to API: connect ECONNREFUSED 127.0.0.1:8045')
        })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Hello'),
                threadId: 'thread-123'
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.error).toBe('LLM Service Unavailable')
        expect(body.details).toContain('Cannot connect to the AI model endpoint')
    })

    it('returns 502 when LLM connection times out', async () => {
        mockStreamText.mockImplementation(() => {
            throw new Error('ETIMEDOUT: connection timed out to 10.0.0.1:443')
        })

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Hello'),
                threadId: 'thread-123'
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(502)
        const body = await res.json()
        expect(body.error).toBe('LLM Service Unavailable')
    })

    it('uses smart model for long follow-up with taskId', async () => {
        ;(env as any).OPENAI_BASE_URL = 'http://localhost:8317/v1'

        const longMessage = 'a'.repeat(220)
        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage(longMessage),
                threadId: 'thread-123',
                taskId: 'task-123'
            })
        })

        await POST(req)

        const callArgs = mockStreamText.mock.calls.at(-1)?.[0]
        expect(callArgs?.model?.id).toBe('gemini-3-pro-preview')
    })

    it('handles persistence in onFinish callback', async () => {
        // This test is tricky because onFinish is a callback.
        // We can simulate calling it manually if we capture it from the mock call.

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Hello'),
                threadId: 'thread-123'
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()

        expect(uiStreamOptions).toHaveProperty('onFinish')

        // Execute onFinish manually
        const finalMessages = [
            {
                ...createTextMessage('Hello', 'user', 'msg-1'),
                metadata: { createdAt: new Date() },
            },
            {
                ...createTextMessage('Hi there', 'assistant', 'msg-2'),
                metadata: { createdAt: new Date() },
            }
        ]

        // Reset mocks to track insertions
        mockInsert.mockClear()

        // Mock checking if message exists (return null so it inserts)
        mockSingle.mockResolvedValue({ data: null })

        await uiStreamOptions.onFinish({ messages: finalMessages })

        // Should try to insert messages
        // We expect at least one insert call for the chat_messages table
        // Note: The implementation iterates and inserts individually
        expect(mockInsert).toHaveBeenCalled()

        // Since we didn't mock the specific table for the second pass in detail in this specific test block (relies on global mock),
        // we just verify that insert was called. 
        // For more rigor, we'd set up the mockFrom to differentiate 'chat_messages' table calls.
    })

    it('backfills thread task_id from create_task tool output in onFinish', async () => {
        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('create task for this video'),
                threadId: 'thread-123'
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()

        mockInsert.mockClear()
        mockUpdate.mockClear()
        mockSingle.mockResolvedValue({ data: null })

        const finalMessages = [
            {
                id: 'assistant-1',
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-create_task',
                        output: { taskId: 'task-created-1' }
                    }
                ],
                metadata: { createdAt: new Date().toISOString() }
            }
        ]

        await uiStreamOptions.onFinish({ messages: finalMessages })

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            updated_at: expect.any(String),
            task_id: 'task-created-1'
        }))
    })
})

describe('Chat Title Generation Logic', () => {
    // Re-setup mocks for this suite since it relies on specific behaviors
    beforeEach(() => {
        vi.clearAllMocks()
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        // ... (We rely on global mocks but need to reset them) ...
        mockFrom.mockImplementation((() => ({
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            upsert: mockUpsert,
        })) as any)

        mockGetUser.mockResolvedValue({
            data: { user: { id: 'test-user-id' } },
            error: null
        })
        mockGetSession.mockResolvedValue({
            data: { session: { user: { id: 'test-user-id' }, access_token: 'valid-token' } },
            error: null
        })

        // Default mocks
        mockSelect.mockImplementation(() => ({
            eq: vi.fn(() => ({
                in: mockIn,
                single: mockSingle,
                order: mockOrder
            })),
            in: mockIn,
            single: mockSingle,
            order: mockOrder
        }))
        mockSingle.mockResolvedValue({ data: null, error: null })
        mockOrder.mockResolvedValue({ data: [], error: null })
        mockIn.mockResolvedValue({ data: [], error: null })
        mockInsert.mockResolvedValue({ error: null })
        mockUpsert.mockResolvedValue({ error: null })
        mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })
        mockCreateUIMessageStream.mockImplementation(({ execute, ...options }: any) => {
            void execute({
                writer: {
                    write: vi.fn(),
                    merge: vi.fn(),
                    onError: vi.fn(),
                },
            })
            return { options }
        })
        mockCreateUIMessageStreamResponse.mockImplementation(() => new Response('mock stream'))
        mockStreamText.mockReturnValue({
            toUIMessageStream: vi.fn().mockReturnValue(new ReadableStream()),
        })
        mockGenerateText.mockResolvedValue({ text: 'Generated Title' })
        mockConvertToModelMessages.mockResolvedValue([])
        mockValidateUIMessages.mockImplementation(async ({ messages }: { messages: ChatUIMessage[] }) => messages)

        ;(global as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                active_provider: 'custom',
                providers: [
                    {
                        provider: 'custom',
                        defaults: {
                            smart: 'gemini-3-pro-preview',
                            fast: 'gemini-3-flash-preview'
                        }
                    }
                ]
            })
        })
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
        consoleWarnSpy.mockRestore()
        consoleLogSpy.mockRestore()
        ;(global as any).fetch = originalFetch
    })

    it('SHOULD generate title if current title is "New Chat" even if messages length > 1 (Lazy Initialization)', async () => {
        const threadId = 'thread-existing-tool-calls'
        
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ 
                                data: { id: threadId, title: 'New Chat' }, 
                                error: null 
                            })
                        })
                    }),
                    update: mockUpdate
                }
            }
            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: [
                                    { id: 'msg-1', role: 'user', content: [{ type: 'text', text: 'Analyze this video' }], created_at: '2024-01-01T00:00:00Z' },
                                    {
                                        id: 'msg-2',
                                        role: 'assistant',
                                        content: [
                                            {
                                                type: 'tool-create_task',
                                                toolCallId: 'tc-1',
                                                state: 'output-available',
                                                input: { video_url: 'https://example.com/video' },
                                                output: { taskId: 'task-existing' }
                                            }
                                        ],
                                        created_at: '2024-01-01T00:00:01Z'
                                    }
                                ],
                                error: null
                            }),
                            single: mockSingle
                        })
                    }),
                    insert: mockInsert,
                    upsert: mockUpsert
                }
            }
            return { select: mockSelect, insert: mockInsert, update: mockUpdate, upsert: mockUpsert }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('How is the progress?'),
                threadId: threadId
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()

        const finalMessages = [
            { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Analyze this video' }] },
            {
                id: 'msg-2',
                role: 'assistant',
                parts: [
                    {
                        type: 'tool-create_task',
                        toolCallId: 'tc-1',
                        state: 'output-available',
                        input: { video_url: 'https://example.com/video' },
                        output: { taskId: 'task-existing' }
                    }
                ]
            },
            { id: 'msg-4', role: 'user', parts: [{ type: 'text', text: 'How is the progress?' }] },
            { id: 'msg-5', role: 'assistant', parts: [{ type: 'text', text: 'It is processing.' }] }
        ]

        await uiStreamOptions.onFinish({ messages: finalMessages })

        expect(mockGenerateText).toHaveBeenCalled()
        const genCallArgs = mockGenerateText.mock.calls[0][0]
        expect(genCallArgs.prompt).toContain('Analyze this video')
        expect(genCallArgs.prompt).toContain('It is processing.')
        expect(mockUpdate).toHaveBeenCalledWith({ title: 'Generated Title' })
    })

    it('should NOT regenerate title if title is already customized', async () => {
        const threadId = 'thread-custom-title'
        
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ 
                                data: { id: threadId, title: 'My Custom Analysis' }, 
                                error: null 
                            })
                        })
                    }),
                    update: mockUpdate
                }
            }
            return { select: mockSelect, insert: mockInsert, update: mockUpdate, upsert: mockUpsert }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message: createTextMessage('More info'), threadId })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()

        const finalMessages = [
            { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
            { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }
        ]

        await uiStreamOptions.onFinish({ messages: finalMessages })

        expect(mockGenerateText).not.toHaveBeenCalled()
    })
})
