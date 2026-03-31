
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

// Mock env before importing route
vi.mock('@/env', () => ({
    env: {
        AI_SDK_DEBUG: '0',
        BACKEND_API_URL: 'http://localhost:8000',
        MODEL_ALIAS_SMART: undefined,
        MODEL_ALIAS_FAST: undefined,
        LLM_PROVIDER: undefined,
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
    mockGetSession,
    mockGenerateText,
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
        mockGenerateText: vi.fn(),
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
        generateText: mockGenerateText,
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

describe('Lazy Thread Creation', () => {
    beforeEach(() => {
        vi.clearAllMocks()

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
        mockSingle.mockResolvedValue({ data: null, error: null })
        mockOrder.mockResolvedValue({ data: [], error: null })
        mockInsert.mockResolvedValue({ error: null })
        mockUpsert.mockResolvedValue({ error: null })

        ;(global as any).fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ active_provider: 'openrouter' })
        })

        mockStreamText.mockReturnValue({
            consumeStream: vi.fn(),
            toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('mock stream'))
        })
        mockConvertToModelMessages.mockResolvedValue([])
    })

    afterEach(() => {
        ;(global as any).fetch = originalFetch
    })

    it('should NOT create thread immediately upon request (Eager vs Lazy Check)', async () => {
        // Setup: Thread does NOT exist
        mockFrom.mockImplementation(((table: string) => {
            if (table === 'chat_threads') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            // Return null to simulate "not found", which triggers creation logic
                            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                        })
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
                message: { content: 'Lazy Check' },
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
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            // Return null to simulate "not found"
                            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                        })
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
                message: { content: 'Finish Me' },
                threadId: 'lazy-finish-thread-id'
            })
        })

        await POST(req)

        // Capture the stream response options
        const streamTextResult = mockStreamText.mock.results[0].value
        const toUIMessageCall = streamTextResult.toUIMessageStreamResponse.mock.calls[0][0]

        expect(toUIMessageCall).toHaveProperty('onFinish')

        // Execute onFinish manually
        const finalMessages = [
            { id: 'msg-1', role: 'user', content: 'Finish Me', createdAt: new Date() },
            { id: 'msg-2', role: 'assistant', content: 'Done.', createdAt: new Date() }
        ]

        // Reset insert mock to clear any previous calls (though there shouldn't be any based on previous test)
        mockInsert.mockClear()

        await toUIMessageCall.onFinish({ messages: finalMessages })

        // ASSERTION: Now we EXPECT the thread insert to happen
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 'lazy-finish-thread-id',
            title: 'New Chat'
        }))
    })
})
