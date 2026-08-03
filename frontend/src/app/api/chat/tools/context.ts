import { z } from 'zod';
import type { ToolContext } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

const supabaseContextSchema = z.custom<ToolContext['supabase']>(isRecord);

const userContextSchema = z.custom<ToolContext['user']>(
    (value) => value === null || (isRecord(value) && typeof value.id === 'string')
);

export const getTaskStatusToolContextSchema = z.object({
    supabase: supabaseContextSchema,
    user: userContextSchema,
    accessToken: z.string().min(1).optional(),
});

export const getTaskOutputsToolContextSchema = z.object({
    supabase: supabaseContextSchema,
    user: userContextSchema,
});

export type ChatToolsContext = {
    get_task_status: z.infer<typeof getTaskStatusToolContextSchema>;
    get_task_outputs: z.infer<typeof getTaskOutputsToolContextSchema>;
};

export function createChatToolsContext(params: {
    supabase: ToolContext['supabase'];
    user: ToolContext['user'];
    accessToken: string | undefined;
}): ChatToolsContext {
    return {
        get_task_status: {
            supabase: params.supabase,
            user: params.user,
            accessToken: params.accessToken,
        },
        get_task_outputs: {
            supabase: params.supabase,
            user: params.user,
        },
    };
}
