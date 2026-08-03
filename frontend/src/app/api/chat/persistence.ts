import type { ToolContext } from './types';
import type { ChatUIMessage } from '@/lib/chat-ui';
import {
    getTextFromUIMessage,
    getMessageCreatedAtIso,
} from './utils';
import { assertPersistableMessages, logInvalidChatMessages, sanitizeIncomingMessages } from '@/lib/chat-message-boundary';

type PersistenceParams = {
    threadId: string | undefined;
    threadTitle: string | undefined;
    requestTaskId: string | null;
    user: { id: string; email?: string };
    supabase: ToolContext['supabase'];
    messages: ChatUIMessage[];
};

type UpsertChatStateParams = {
    threadId: string;
    user: { id: string; email?: string };
    supabase: ToolContext['supabase'];
    messages: ChatUIMessage[];
    taskIdToBind?: string | null;
    threadTitle?: string | undefined;
};

type RestoreArchivedThreadParams = {
    threadId: string;
    userId: string;
    supabase: ToolContext['supabase'];
};

type RestorableThreadRow = {
    id: string;
    title: string;
    status: 'active' | 'archived' | 'deleted';
};

const THREAD_TITLE_MAX_LENGTH = 48;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

function truncateThreadTitle(value: string) {
    const characters = Array.from(value);
    if (characters.length <= THREAD_TITLE_MAX_LENGTH) return value;
    return `${characters.slice(0, THREAD_TITLE_MAX_LENGTH - 1).join('')}…`;
}

function cleanThreadTitle(value: string) {
    return truncateThreadTitle(
        value
            .replace(/^[\s#>*_`"'“”‘’]+|[\s#>*_`"'“”‘’]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function getVideoUrlTitle(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
        const segments = url.pathname.split('/').filter(Boolean);
        let platform = hostname;
        let identifier = segments.at(-1) ?? '';

        if (hostname === 'youtu.be' || hostname.endsWith('youtube.com')) {
            platform = 'YouTube';
            identifier = hostname === 'youtu.be'
                ? (segments[0] ?? '')
                : (url.searchParams.get('v') ?? segments.at(-1) ?? '');
        } else if (hostname.endsWith('bilibili.com') || hostname === 'b23.tv') {
            platform = 'Bilibili';
            identifier = segments.find((segment) => /^(BV|av)/i.test(segment))
                ?? segments.at(-1)
                ?? '';
        } else if (hostname === 'x.com' || hostname.endsWith('twitter.com')) {
            platform = 'X';
            const statusIndex = segments.indexOf('status');
            identifier = statusIndex >= 0 ? (segments[statusIndex + 1] ?? '') : (segments.at(-1) ?? '');
        } else if (hostname.endsWith('tiktok.com')) {
            platform = 'TikTok';
            const videoIndex = segments.indexOf('video');
            identifier = videoIndex >= 0 ? (segments[videoIndex + 1] ?? '') : (segments.at(-1) ?? '');
        } else if (hostname.endsWith('instagram.com')) {
            platform = 'Instagram';
        } else if (hostname.endsWith('vimeo.com')) {
            platform = 'Vimeo';
        }

        const decodedIdentifier = identifier
            ? decodeURIComponent(identifier).replace(/[?&#].*$/, '')
            : '';

        return cleanThreadTitle(
            decodedIdentifier && decodedIdentifier !== platform
                ? `${platform} · ${decodedIdentifier}`
                : platform
        );
    } catch {
        return '';
    }
}

export function deriveThreadTitle(messageText: string, videoUrl?: string) {
    const textWithoutUrls = messageText.replace(URL_PATTERN, ' ');
    const descriptiveText = cleanThreadTitle(textWithoutUrls);
    if (descriptiveText) return descriptiveText;

    const detectedUrl = videoUrl ?? messageText.match(URL_PATTERN)?.[0];
    const urlTitle = detectedUrl ? getVideoUrlTitle(detectedUrl) : '';
    return urlTitle || 'New Chat';
}

export async function restoreArchivedThreadIfNeeded({
    threadId,
    userId,
    supabase,
}: RestoreArchivedThreadParams): Promise<RestorableThreadRow | null> {
    const { data: thread, error: threadError } = await supabase
        .from('chat_threads')
        .select('id, title, status')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

    if (threadError) {
        if (threadError.code !== 'PGRST116') {
            console.error('[API/Chat] Thread lookup error:', threadError);
        }
        return null;
    }

    if (!thread) {
        return null;
    }

    if (thread.status !== 'archived') {
        return thread as RestorableThreadRow;
    }

    const { error: restoreError } = await supabase
        .from('chat_threads')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', threadId)
        .eq('user_id', userId);

    if (restoreError) {
        throw restoreError;
    }

    return {
        ...thread,
        status: 'active',
    } as RestorableThreadRow;
}

export async function upsertChatState({
    threadId,
    user,
    supabase,
    messages,
    taskIdToBind,
    threadTitle,
}: UpsertChatStateParams) {
    const { invalidMessages } = sanitizeIncomingMessages(messages);
    logInvalidChatMessages({
        source: 'persistence',
        threadId,
        invalidMessages,
    });
    const persistableMessages = assertPersistableMessages(messages);

    const { data: existingThread } = await supabase
        .from('chat_threads')
        .select('id, status')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single();

    if (!existingThread) {
        const threadInsertPayload: Record<string, unknown> = {
            id: threadId,
            user_id: user.id,
            title: threadTitle || 'New Chat',
            updated_at: new Date().toISOString(),
        };
        if (taskIdToBind) {
            threadInsertPayload.task_id = taskIdToBind;
        }

        const { error: createError } = await supabase
            .from('chat_threads')
            .insert(threadInsertPayload);
        if (createError) {
            throw createError;
        }
    }

    const messagesToUpsert = persistableMessages.map((msg) => ({
        id: msg.id,
        thread_id: threadId,
        role: msg.role,
        content: msg.parts,
        metadata: msg.metadata ?? {},
        created_at: getMessageCreatedAtIso(msg),
    }));

    const { error: upsertError } = await supabase
        .from('chat_messages')
        .upsert(messagesToUpsert, { onConflict: 'id', ignoreDuplicates: true });

    if (upsertError) {
        throw upsertError;
    }

    const threadUpdatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        status: 'active',
    };
    if (taskIdToBind) {
        threadUpdatePayload.task_id = taskIdToBind;
    }
    if (threadTitle) {
        threadUpdatePayload.title = threadTitle;
    }

    const { error: threadUpdateError } = await supabase
        .from('chat_threads')
        .update(threadUpdatePayload)
        .eq('id', threadId)
        .eq('user_id', user.id);

    if (threadUpdateError) {
        throw threadUpdateError;
    }
}

/**
 * Creates the onFinish callback for stream response persistence.
 * Handles thread lazy creation, message upsert, task binding, and deterministic titles.
 */
export function createOnFinishHandler(params: PersistenceParams) {
    const {
        threadId,
        threadTitle,
        requestTaskId,
        user,
        supabase,
        messages,
    } = params;

    return async ({ messages: finalMessages }: { messages: ChatUIMessage[] }) => {
        try {
            if (!threadId) {
                console.warn('[API/Chat] No threadId in onFinish, skipping persistence.');
                return;
            }

            const persistableFinalMessages = assertPersistableMessages(finalMessages);

            // URL submissions bind a task in direct-submit; conversational Q&A
            // can only retain the explicit task selected by the user.
            const taskIdToBind = requestTaskId;
            const isNewChat = !threadTitle || threadTitle === 'New Chat';
            const firstUserMsg = [...messages, ...finalMessages].find(
                (message) => message.role === 'user' && getTextFromUIMessage(message).length > 0
            );
            const resolvedThreadTitle = isNewChat && firstUserMsg
                ? deriveThreadTitle(getTextFromUIMessage(firstUserMsg))
                : threadTitle;

            await upsertChatState({
                threadId,
                user,
                supabase,
                messages: persistableFinalMessages,
                taskIdToBind,
                threadTitle: resolvedThreadTitle,
            });
        } catch (persistError) {
            console.error('[API/Chat] Persistence Error in onFinish:', persistError);
        }
    };
}
