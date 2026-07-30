import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeStoredMessages, logInvalidChatMessages } from '@/lib/chat-message-boundary';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type GetThreadMessagesParams = {
    supabase: SupabaseServerClient;
    threadId: string;
};

export async function getThreadMessagesResponse({
    supabase,
    threadId,
}: GetThreadMessagesParams) {
    const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, created_at, metadata')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[API/Chat] Failed to fetch thread messages:', error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    const { validMessages, invalidMessages } = sanitizeStoredMessages(messages ?? []);
    logInvalidChatMessages({
        source: 'thread-read',
        threadId,
        invalidMessages,
    });

    return NextResponse.json(validMessages);
}
