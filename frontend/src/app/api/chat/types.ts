import type { UIMessage } from 'ai';

export type ModelTier = 'smart' | 'fast';

export type ResolvedModel = {
    model: string;
    provider: string;
};

export type RequestPayload = {
    message?: UIMessage & { content?: string };
    threadId?: string;
    taskId?: string;
};

export type ChatMessageRow = {
    id: string;
    role: UIMessage['role'];
    content: unknown;
    created_at: string;
};

export type TextPart = {
    type: 'text';
    text: string;
};

export type PreviewCache = {
    url: string;
    title?: string;
    thumbnail?: string;
} | null;

/** Shared context passed to tool execute functions */
export type ToolContext = {
    supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>;
    user: { id: string; email?: string } | null;
    accessToken: string | undefined;
    messages: UIMessage[];
    previewCache: PreviewCache;
    setPreviewCache: (cache: PreviewCache) => void;
    threadId: string | undefined;
};
