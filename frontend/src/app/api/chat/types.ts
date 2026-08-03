import type { ChatUIMessage } from '@/lib/chat-ui';

export type ModelTier = 'smart' | 'fast';

export type ResolvedModel = {
    model: string;
    provider: string;
};

export type RequestPayload = {
    message?: ChatUIMessage;
    threadId?: string;
    taskId?: string;
};

export type ChatMessageRow = {
    id: string;
    role: ChatUIMessage['role'];
    content: unknown;
    created_at: string;
    metadata?: unknown;
};

export type TextPart = {
    type: 'text';
    text: string;
};

/** Shared context passed to tool execute functions */
export type ToolContext = {
    supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>;
    user: { id: string; email?: string } | null;
    accessToken: string | undefined;
};
