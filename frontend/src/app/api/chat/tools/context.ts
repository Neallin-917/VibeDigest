import { z } from 'zod';
import type { ChatUIMessage } from '@/lib/chat-ui';
import type { PreviewCache, ToolContext } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

const supabaseContextSchema = z.custom<ToolContext['supabase']>(isRecord);

const userContextSchema = z.custom<ToolContext['user']>(
    (value) => value === null || (isRecord(value) && typeof value.id === 'string')
);

const messagesContextSchema = z.custom<ChatUIMessage[]>(Array.isArray);

export const getTaskStatusToolContextSchema = z.object({
    supabase: supabaseContextSchema,
    user: userContextSchema,
    accessToken: z.string().min(1).optional(),
    getPreviewCache: z.custom<() => PreviewCache>((value) => typeof value === 'function'),
});

export const getTaskOutputsToolContextSchema = z.object({
    supabase: supabaseContextSchema,
    user: userContextSchema,
});

export const createTaskToolContextSchema = z.object({
    supabase: supabaseContextSchema,
    user: userContextSchema,
    accessToken: z.string().min(1).optional(),
    messages: messagesContextSchema,
    threadId: z.string().min(1).optional(),
});

export const previewVideoToolContextSchema = z.object({
    accessToken: z.string().min(1).optional(),
    messages: messagesContextSchema,
    setPreviewCache: z.custom<(cache: PreviewCache) => void>((value) => typeof value === 'function'),
});

export type ChatToolsContext = {
    get_task_status: z.infer<typeof getTaskStatusToolContextSchema>;
    get_task_outputs: z.infer<typeof getTaskOutputsToolContextSchema>;
    create_task: z.infer<typeof createTaskToolContextSchema>;
    preview_video: z.infer<typeof previewVideoToolContextSchema>;
};

export function createChatToolsContext(params: {
    supabase: ToolContext['supabase'];
    user: ToolContext['user'];
    accessToken: string | undefined;
    messages: ChatUIMessage[];
    threadId: string | undefined;
    getPreviewCache: () => PreviewCache;
    setPreviewCache: (cache: PreviewCache) => void;
}): ChatToolsContext {
    return {
        get_task_status: {
            supabase: params.supabase,
            user: params.user,
            accessToken: params.accessToken,
            getPreviewCache: params.getPreviewCache,
        },
        get_task_outputs: {
            supabase: params.supabase,
            user: params.user,
        },
        create_task: {
            supabase: params.supabase,
            user: params.user,
            accessToken: params.accessToken,
            messages: params.messages,
            threadId: params.threadId,
        },
        preview_video: {
            accessToken: params.accessToken,
            messages: params.messages,
            setPreviewCache: params.setPreviewCache,
        },
    };
}
