import { describe, expect, it } from 'vitest';
import { createChatToolsContext } from './context';
import type { ToolContext } from '../types';

describe('createChatToolsContext', () => {
    it('passes each tool only the context it needs', () => {
        const contexts = createChatToolsContext({
            supabase: {} as ToolContext['supabase'],
            user: { id: 'user-1' },
            accessToken: 'access-token',
        });

        expect(Object.keys(contexts.get_task_status)).toEqual([
            'supabase',
            'user',
            'accessToken',
        ]);
        expect(Object.keys(contexts.get_task_outputs)).toEqual(['supabase', 'user']);
    });
});
