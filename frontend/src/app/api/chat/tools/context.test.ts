import { describe, expect, it, vi } from 'vitest';
import { createChatToolsContext } from './context';
import type { ToolContext } from '../types';

describe('createChatToolsContext', () => {
    it('passes each tool only the context it needs', () => {
        const contexts = createChatToolsContext({
            supabase: {} as ToolContext['supabase'],
            user: { id: 'user-1' },
            accessToken: 'access-token',
            messages: [],
            threadId: 'thread-1',
            getPreviewCache: () => null,
            setPreviewCache: vi.fn(),
        });

        expect(Object.keys(contexts.get_task_status)).toEqual([
            'supabase',
            'user',
            'accessToken',
            'getPreviewCache',
        ]);
        expect(Object.keys(contexts.get_task_outputs)).toEqual(['supabase', 'user']);
        expect(Object.keys(contexts.create_task)).toEqual([
            'supabase',
            'user',
            'accessToken',
            'messages',
            'threadId',
        ]);
        expect(Object.keys(contexts.preview_video)).toEqual([
            'accessToken',
            'messages',
            'setPreviewCache',
        ]);
    });
});
