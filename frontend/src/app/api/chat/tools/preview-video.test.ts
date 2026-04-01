import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/env before importing the module under test
vi.mock('@/env', () => ({
    env: {
        BACKEND_API_URL: 'http://test-backend:8000',
        NEXT_PUBLIC_E2E_MOCK: undefined,
    },
}));

import { createPreviewVideoTool } from './preview-video';
import type { ToolContext } from '../types';
import type { ChatUIMessage } from '@/lib/chat-ui';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
        supabase: {} as any,
        user: { id: 'test-user-id' },
        accessToken: 'valid-token',
        messages: [],
        previewCache: null,
        setPreviewCache: vi.fn(),
        threadId: undefined,
        ...overrides,
    };
}

const EXECUTE_OPTS = { toolCallId: 'tc1', messages: [], abortSignal: undefined as any };

describe('createPreviewVideoTool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Auth & Session ---

    it('returns SESSION_EXPIRED when accessToken is undefined (no fetch call)', async () => {
        const ctx = makeCtx({ accessToken: undefined });
        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: 'SESSION_EXPIRED',
            user_action: 'sign_in_required',
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- HTTP Error Codes ---

    it('returns actionable error when backend returns 401', async () => {
        const ctx = makeCtx();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ detail: 'Invalid Token' }),
        });

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
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

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: 'Service configuration error',
            status: 503,
        });
        expect(result).toHaveProperty('details');
    });

    it('returns generic error for other non-ok statuses (e.g. 500)', async () => {
        const ctx = makeCtx();
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ detail: 'Internal server error' }),
        });

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: 'Failed to preview video',
            details: 'Internal server error',
            status: 500,
        });
    });

    // --- Success Path ---

    it('returns data and calls setPreviewCache on successful 200 with title', async () => {
        const ctx = makeCtx();
        const mockData = {
            title: 'Test Video Title',
            thumbnail: 'https://img.youtube.com/vi/test/0.jpg',
            duration: '10:30',
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockData,
        });

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toEqual(mockData);
        expect(ctx.setPreviewCache).toHaveBeenCalledWith({
            url: 'https://www.youtube.com/watch?v=test',
            title: 'Test Video Title',
            thumbnail: 'https://img.youtube.com/vi/test/0.jpg',
        });
        // Verify Authorization header
        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.headers.Authorization).toBe('Bearer valid-token');
    });

    it('does NOT call setPreviewCache when response lacks title and thumbnail', async () => {
        const ctx = makeCtx();
        const mockData = { duration: '5:00' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockData,
        });

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toEqual(mockData);
        expect(ctx.setPreviewCache).not.toHaveBeenCalled();
    });

    // --- URL Validation & Fallback ---

    it('returns error when no valid URL in args and no message history', async () => {
        const ctx = makeCtx({ messages: [] });
        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'not a valid url' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: expect.stringContaining('No valid URL'),
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('falls back to URL from message history when args URL is invalid', async () => {
        const messages: ChatUIMessage[] = [
            {
                id: 'msg-1',
                role: 'user',
                parts: [{ type: 'text', text: 'Check this https://www.youtube.com/watch?v=abc123' }],
            },
        ];
        const ctx = makeCtx({ messages });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ title: 'Fallback Video' }),
        });

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'some garbage text' },
            EXECUTE_OPTS,
        );

        // Should have called fetch with the fallback URL
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [fetchUrl] = mockFetch.mock.calls[0];
        expect(fetchUrl).toBe('http://test-backend:8000/api/preview-video');
        expect(result).toMatchObject({ title: 'Fallback Video' });
    });

    // --- Network Exceptions ---

    it('handles network error when fetch throws', async () => {
        const ctx = makeCtx();
        mockFetch.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: 'Failed to preview video',
            details: 'fetch failed: ECONNREFUSED',
        });
    });

    it('handles non-Error throw from fetch gracefully', async () => {
        const ctx = makeCtx();
        mockFetch.mockRejectedValueOnce('string error');

        const tool = createPreviewVideoTool(ctx);
        const result = await tool.execute(
            { video_url: 'https://www.youtube.com/watch?v=test' },
            EXECUTE_OPTS,
        );

        expect(result).toMatchObject({
            error: 'Failed to preview video',
            details: 'Unknown error',
        });
    });
});
