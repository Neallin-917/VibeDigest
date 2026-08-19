import { describe, expect, it, vi } from 'vitest';
import { getTaskOutputsTool } from './get-task-outputs';
import type { ToolContext } from '../types';

function makeSupabase(params: {
    task: { user_id: string; is_demo: boolean } | null;
    outputs?: unknown[] | null;
    taskError?: { message: string } | null;
    outputsError?: { message: string } | null;
}): ToolContext['supabase'] {
    const outputResult = {
        data: params.outputs ?? [],
        error: params.outputsError ?? null,
    };
    const outputsQuery = {
        eq: vi.fn(),
        in: vi.fn(),
        then: <TResult1 = typeof outputResult, TResult2 = never>(
            onfulfilled?: ((value: typeof outputResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) => Promise.resolve(outputResult).then(onfulfilled, onrejected),
    };
    outputsQuery.eq.mockReturnValue(outputsQuery);
    outputsQuery.in.mockResolvedValue(outputResult);

    // The tool only calls `from`; do not pretend this narrow test double is a
    // fully initialized Supabase client.
    return {
        from: vi.fn((table: string) => {
            if (table === 'tasks') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: params.task,
                                error: params.taskError ?? null,
                            }),
                        }),
                    }),
                };
            }

            return {
                select: vi.fn().mockReturnValue(outputsQuery),
            };
        }),
    } as unknown as ToolContext['supabase'];
}

function execute(context: { supabase: ToolContext['supabase']; user: ToolContext['user'] }) {
    return getTaskOutputsTool.execute!(
        { taskId: 'task-1', kinds: ['summary'] },
        {
            toolCallId: 'tool-call-1',
            messages: [],
            abortSignal: undefined as never,
            context,
        }
    );
}

describe('getTaskOutputsTool', () => {
    it('returns completed outputs owned by the current user', async () => {
        const output = { kind: 'summary', content: 'Summary', status: 'completed' };
        const result = await execute({
            supabase: makeSupabase({
                task: { user_id: 'user-1', is_demo: false },
                outputs: [output],
            }),
            user: { id: 'user-1' },
        });

        expect(result).toEqual({ taskId: 'task-1', outputs: [output], count: 1 });
    });

    it('rejects output access for a task owned by another user', async () => {
        const result = await execute({
            supabase: makeSupabase({ task: { user_id: 'user-2', is_demo: false } }),
            user: { id: 'user-1' },
        });

        expect(result).toEqual({ error: 'Access denied', taskId: 'task-1' });
    });

    it('returns a not-found result when the task query fails', async () => {
        const result = await execute({
            supabase: makeSupabase({
                task: null,
                taskError: { message: 'row not found' },
            }),
            user: { id: 'user-1' },
        });

        expect(result).toEqual({ error: 'Task not found', taskId: 'task-1' });
    });
});
