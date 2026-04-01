import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/env before importing the module under test
vi.mock('@/env', () => ({
    env: {
        BACKEND_API_URL: 'http://test-backend:8000',
        NEXT_PUBLIC_E2E_MOCK: undefined,
    },
}));

import { createCreateTaskTool } from './create-task';
import type { ToolContext } from '../types';
import type { ChatUIMessage } from '@/lib/chat-ui';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        supabase: {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: null }),
                    }),
                }),
            }),
        } as any,
        user: { id: 'test-user-id' },
        accessToken: 'valid-token',
        messages: [],
        previewCache: null,
        setPreviewCache: vi.fn(),
        threadId: undefined,
        ...overrides,
    };
}

describe('createCreateTaskTool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns SESSION_EXPIRED when accessToken is undefined (no fetch call)', async () => {
        const ctx = makeCtx({ accessToken: undefined });
        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc1', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            error: 'SESSION_EXPIRED',
            user_action: 'sign_in_required',
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns actionable error when backend returns 401', async () => {
        const ctx = makeCtx();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ detail: 'Invalid Token' }),
        });

        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc2', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            error: 'Authentication failed',
            user_action: 'sign_in_required',
            status: 401,
        });
    });

    it('returns service error when backend returns 503', async () => {
        const ctx = makeCtx();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({ detail: 'Authentication service misconfigured' }),
        });

        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc3', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            error: 'Service configuration error',
            status: 503,
        });
    });

    it('returns taskId on successful 200 response', async () => {
        const ctx = makeCtx();
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ task_id: 'task_abc', message: 'Task started' }),
        });

        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc4', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            taskId: 'task_abc',
            status: 'started',
        });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        // Verify the Authorization header uses the token, not "Bearer undefined"
        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.headers.Authorization).toBe('Bearer valid-token');
    });

    // --- Thread-Task 1:1 Constraint ---

    it('blocks new task when thread already has a task_id (suggest_new_chat)', async () => {
        const ctx = makeCtx({
            threadId: 'thread-with-task',
            supabase: {
                from: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: { task_id: 'existing-task-abc' },
                            }),
                        }),
                    }),
                }),
            } as any,
        });
        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=new' },
            { toolCallId: 'tc5', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            suggest_new_chat: true,
            existing_task_id: 'existing-task-abc',
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- Authentication Required ---

    it('returns "Authentication required" when user.id is falsy', async () => {
        const ctx = makeCtx({ user: null });
        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc6', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({ error: 'Authentication required' });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- Invalid URL ---

    it('returns error when URL is invalid and no fallback in history', async () => {
        const ctx = makeCtx({ messages: [] });
        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'not a url at all' },
            { toolCallId: 'tc7', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            error: expect.stringContaining('No valid URL'),
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- URL Fallback from Message History ---

    it('falls back to URL from message history when args URL is invalid', async () => {
        const messages: ChatUIMessage[] = [
            {
                id: 'msg-1',
                role: 'user',
                parts: [{ type: 'text', text: 'Process https://www.youtube.com/watch?v=fallback123' }],
            },
        ];
        const ctx = makeCtx({ messages });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ task_id: 'task_fallback', message: 'Task started' }),
        });

        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'garbage input' },
            { toolCallId: 'tc8', messages: [], abortSignal: undefined as any },
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            taskId: 'task_fallback',
            status: 'started',
        });
    });

    // --- Network Exception ---

    it('handles network error when fetch throws', async () => {
        const ctx = makeCtx();
        mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const tool = createCreateTaskTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            { toolCallId: 'tc9', messages: [], abortSignal: undefined as any },
        );

        expect(result).toMatchObject({
            error: 'Failed to create task',
            details: 'ECONNREFUSED',
        });
    });
});
