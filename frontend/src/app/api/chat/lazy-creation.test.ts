
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'
import type { ChatUIMessage } from '@/lib/chat-ui'

// Mock env before importing route
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
    }
}))

// --- Mocks ---
const {
    mockGetUser,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockUpsert,
    mockEq,
    mockIn,
    mockSingle,
    mockOrder,
    mockFrom,
    mockStreamText,
    mockConvertToModelMessages,
    mockValidateUIMessages,
    mockGetSession,
    mockGenerateText,
    mockCreateUIMessageStream,
    mockCreateUIMessageStreamResponse,
} = vi.hoisted(() => {
    return {
        mockGetUser: vi.fn(),
        mockGetSession: vi.fn(),
        mockSelect: vi.fn(),
        mockInsert: vi.fn(),
        mockUpdate: vi.fn(),
        mockUpsert: vi.fn(),
        mockEq: vi.fn(),
        mockIn: vi.fn(),
        mockSingle: vi.fn(),
        mockOrder: vi.fn(),
        mockFrom: vi.fn(),
        mockStreamText: vi.fn(),
        mockConvertToModelMessages: vi.fn(),
        mockValidateUIMessages: vi.fn(),
        mockGenerateText: vi.fn(),
        mockCreateUIMessageStream: vi.fn(),
        mockCreateUIMessageStreamResponse: vi.fn(),
    }
})

// Chainable mock implementation
mockFrom.mockImplementation((() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    upsert: mockUpsert,
})) as any)

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

vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn(() => ({
        chat: vi.fn((model: string) => ({ id: model }))
    }))
}))

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

function createSelectSingleMock(result: { data: unknown; error?: unknown }) {
    const chain = {} as {
        eq: ReturnType<typeof vi.fn>
        single: ReturnType<typeof vi.fn>
    }
    chain.eq = vi.fn(() => chain)
    chain.single = vi.fn().mockResolvedValue(result)
    return vi.fn().mockReturnValue(chain)
}

describe('Lazy Thread Creation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        // Default implementation for standard chains
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

        // Default chain returns
        mockSelect.mockImplementation(() => {
            const chain = {} as {
                eq: ReturnType<typeof vi.fn>
                in: typeof mockIn
                single: typeof mockSingle
                order: typeof mockOrder
            }
            chain.eq = vi.fn(() => chain)
            chain.in = mockIn
            chain.single = mockSingle
            chain.order = mockOrder
            return chain
        })
        mockUpdate.mockImplementation(() => {
            const chain = {} as { eq: ReturnType<typeof vi.fn> }
            chain.eq = vi.fn(() => chain)
            return chain
        })
        mockEq.mockImplementation(() => {
            return { single: mockSingle, order: mockOrder };
        })
        mockIn.mockResolvedValue({ data: [], error: null })
        mockSingle.mockResolvedValue({ data: null, error: null })
        mockOrder.mockResolvedValue({ data: [], error: null })
        mockInsert.mockResolvedValue({ error: null })
        mockUpsert.mockResolvedValue({ error: null })
        mockGenerateText.mockResolvedValue({ text: 'Generated Title' })

        ;(global as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ active_provider: 'openrouter' })
        })

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
        mockConvertToModelMessages.mockResolvedValue([])
        mockValidateUIMessages.mockImplementation(async ({ messages }: { messages: ChatUIMessage[] }) => messages)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
        consoleWarnSpy.mockRestore()
        consoleLogSpy.mockRestore()
        ;(global as any).fetch = originalFetch
    })

    it('should NOT create thread immediately upon request (Eager vs Lazy Check)', async () => {
        // Setup: Thread does NOT exist
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: createSelectSingleMock({
                        data: null,
                        error: { code: 'PGRST116' },
                    }),
                    insert: mockInsert
                }
            }
            // For chat_messages or others
            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate,
                upsert: mockUpsert
            }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Lazy Check'),
                threadId: 'lazy-thread-id'
            })
        })

        await POST(req)

        // ASSERTION: In the current code (Eager), this should fail if we expect NO calls.
        // But since we are writing a RED test for the DESIRED behavior (Lazy):
        // We expect mockInsert NOT to be called for chat_threads during the initial POST handler execution.
        
        // Check calls to mockFrom('chat_threads') -> insert(...)
        // Since mockFrom returns an object with insert, checking if insert was called is slightly ambiguous 
        // if we don't track which table called it.
        // But in our mock implementation above, we use the global `mockInsert`.
        
        // Current code DOES insert eagerly. So this expectation should FAIL.
        expect(mockInsert).not.toHaveBeenCalled() 
    })

    it('should create thread in onFinish if it does not exist (Lazy Creation Success)', async () => {
        // Setup: Thread does NOT exist initially
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: createSelectSingleMock({
                        data: null,
                        error: { code: 'PGRST116' },
                    }),
                    insert: mockInsert,
                    update: mockUpdate
                }
            }
            // For chat_messages
            if (table === 'chat_messages') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({ data: null }), // Messages don't exist yet
                            order: mockOrder // Needed for initial load query
                        })
                    }),
                    insert: mockInsert,
                    upsert: mockUpsert
                }
            }
            return {
                select: mockSelect,
                insert: mockInsert,
                update: mockUpdate,
                upsert: mockUpsert
            }
        }) as any)

        const req = new NextRequest('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: createTextMessage('Finish Me'),
                threadId: 'lazy-finish-thread-id'
            })
        })

        await POST(req)

        const uiStreamOptions = getLastUIStreamOptions()

        expect(uiStreamOptions).toHaveProperty('onFinish')

        // Execute onFinish manually
        const finalMessages = [
            {
                ...createTextMessage('Finish Me', 'user', 'msg-1'),
                metadata: { createdAt: new Date() }
            },
            {
                ...createTextMessage('Done.', 'assistant', 'msg-2'),
                metadata: { createdAt: new Date() }
            }
        ]

        // Reset insert mock to clear any previous calls (though there shouldn't be any based on previous test)
        mockInsert.mockClear()

        await uiStreamOptions.onFinish({ messages: finalMessages })

        // ASSERTION: Now we EXPECT the thread insert to happen
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 'lazy-finish-thread-id',
            title: 'Finish Me'
        }))
    })
})
