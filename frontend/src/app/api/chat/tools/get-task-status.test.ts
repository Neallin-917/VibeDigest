import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/backend-url before importing the module under test
vi.mock('@/lib/backend-url', () => ({
    BACKEND_API_URL: 'http://test-backend:8000',
    SERVER_BACKEND_URL: 'http://test-backend:8000',
}));

import { getTaskStatusTool } from './get-task-status';
import type { ToolContext } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Helper: build a mock Supabase chain that resolves sequentially */
function makeSupabaseMock(results: Array<{ data: any; error?: any }>) {
    let callIndex = 0;
    const mockSingle = vi.fn(() => {
        const result = results[callIndex] ?? { data: null };
        callIndex++;
        return Promise.resolve(result);
    });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    return {
        from: vi.fn().mockReturnValue({ select: mockSelect }),
        _mockSingle: mockSingle,
        _mockEq: mockEq,
    };
}

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        supabase: makeSupabaseMock([{ data: null }]) as any,
        user: { id: 'test-user-id' },
        accessToken: 'valid-token',
        messages: [],
        previewCache: null,
        setPreviewCache: vi.fn(),
        threadId: undefined,
        ...overrides,
    };
}

const execOpts = { toolCallId: 'tc1', messages: [], abortSignal: undefined as any, context: {} };

type GetTaskStatusExecute = NonNullable<typeof getTaskStatusTool.execute>;

function createGetTaskStatusTool(context: ToolContext): { execute: GetTaskStatusExecute } {
    const execute: GetTaskStatusExecute = (input, options) =>
        getTaskStatusTool.execute!(input, {
            ...options,
            context: {
                supabase: context.supabase,
                user: context.user,
                accessToken: context.accessToken,
                getPreviewCache: () => context.previewCache,
            },
        });

    return { execute };
}

describe('createGetTaskStatusTool – retry logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should succeed on first try when task exists', async () => {
        const taskRow = {
            id: 'task-1',
            user_id: 'test-user-id',
            status: 'processing',
            progress: 42,
            video_url: 'https://youtube.com/watch?v=abc',
            video_title: 'My Video',
            thumbnail_url: 'thumb.jpg',
            error_message: null,
            created_at: '2026-01-01',
            updated_at: '2026-01-02',
        };
        const supabase = makeSupabaseMock([{ data: taskRow }]);
        const ctx = makeCtx({ supabase: supabase as any });

        const tool = createGetTaskStatusTool(ctx);
        const result = await tool.execute!({ taskId: 'task-1' }, execOpts);

        expect(result).toMatchObject({
            taskId: 'task-1',
            status: 'processing',
            progress: 42,
        });
        // Should NOT have called fetch (backend API fallback)
        expect(mockFetch).not.toHaveBeenCalled();
        // Supabase single() should be called only once
        expect(supabase._mockSingle).toHaveBeenCalledTimes(1);
    });

    it('maps backend error status and sanitizes stored HTML error messages', async () => {
        const taskRow = {
            id: 'task-1',
            user_id: 'test-user-id',
            status: 'error',
            progress: 100,
            video_url: 'https://youtube.com/watch?v=abc',
            video_title: 'My Video',
            thumbnail_url: 'thumb.jpg',
            error_message: '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>',
            created_at: '2026-01-01',
            updated_at: '2026-01-02',
        };
        const supabase = makeSupabaseMock([{ data: taskRow }]);
        const ctx = makeCtx({ supabase: supabase as any });

        const tool = createGetTaskStatusTool(ctx);
        const result = await tool.execute!({ taskId: 'task-1' }, execOpts);

        expect(result).toMatchObject({
            taskId: 'task-1',
            status: 'failed',
            error_message: expect.stringContaining('blocking automated access'),
        });
        expect((result as { error_message?: string }).error_message).not.toContain('<!DOCTYPE');
    });

    it('should retry once after initial Supabase query returns null', async () => {
        const taskRow = {
            id: 'task-1',
            user_id: 'test-user-id',
            status: 'pending',
            progress: 0,
            video_url: null,
            video_title: null,
            thumbnail_url: null,
            error_message: null,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        };
        // First call returns null, second call returns the task
        const supabase = makeSupabaseMock([{ data: null }, { data: taskRow }]);
        const ctx = makeCtx({ supabase: supabase as any });

        const tool = createGetTaskStatusTool(ctx);
        const promise = tool.execute!({ taskId: 'task-1' }, execOpts);

        // Advance past the 500ms retry delay
        await vi.advanceTimersByTimeAsync(600);

        const result = await promise;

        expect(result).toMatchObject({
            taskId: 'task-1',
            status: 'pending',
        });
        // Supabase should have been queried twice (original + retry)
        expect(supabase._mockSingle).toHaveBeenCalledTimes(2);
        // Backend API should NOT have been called
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fall back to backend API when retry also fails', async () => {
        // Both Supabase queries return null
        const supabase = makeSupabaseMock([{ data: null }, { data: null }]);
        const ctx = makeCtx({ supabase: supabase as any });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: 'task-1',
                status: 'processing',
                progress: 10,
                video_title: 'Fallback Video',
                thumbnail_url: null,
                video_url: 'https://youtube.com/watch?v=xyz',
                error: null,
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
            }),
        });

        const tool = createGetTaskStatusTool(ctx);
        const promise = tool.execute!({ taskId: 'task-1' }, execOpts);
        await vi.advanceTimersByTimeAsync(600);
        const result = await promise;

        expect(result).toMatchObject({
            taskId: 'task-1',
            status: 'processing',
            source: 'backend_api_fallback',
        });
        expect(supabase._mockSingle).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return task not found only when all attempts fail', async () => {
        // Both Supabase queries return null
        const supabase = makeSupabaseMock([{ data: null }, { data: null }]);
        const ctx = makeCtx({ supabase: supabase as any });

        // Backend API also fails
        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

        const tool = createGetTaskStatusTool(ctx);
        const promise = tool.execute!({ taskId: 'task-nonexistent' }, execOpts);
        await vi.advanceTimersByTimeAsync(600);
        const result = await promise;

        expect(result).toMatchObject({
            error: 'Task not found',
            taskId: 'task-nonexistent',
        });
        expect(supabase._mockSingle).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
