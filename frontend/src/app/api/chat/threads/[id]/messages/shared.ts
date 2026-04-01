import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isStrictStoredMessageRow } from '@/lib/chat-ui';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type GetThreadMessagesParams = {
    supabase: SupabaseServerClient;
    threadId: string;
    userId: string;
};

export async function getThreadMessagesResponse({
    supabase,
    threadId,
    userId,
}: GetThreadMessagesParams) {
    const { data: thread, error: threadError } = await supabase
        .from('chat_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single();

    if (threadError || !thread) {
        return NextResponse.json({ error: 'Thread not found or access denied' }, { status: 404 });
    }

    const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, created_at, metadata')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[API/Chat] Failed to fetch thread messages:', error);
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    const validMessages = (messages ?? []).filter(isStrictStoredMessageRow);
    const invalidMessageIds = (messages ?? [])
        .filter((message) => !isStrictStoredMessageRow(message))
        .map((message) => String(message.id));

    if (invalidMessageIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('chat_messages')
            .delete()
            .in('id', invalidMessageIds);

        if (deleteError) {
            console.error('[API/Chat] Failed to delete invalid historical thread messages:', deleteError);
        } else {
            console.warn(
                `[API/Chat] Deleted ${invalidMessageIds.length} invalid historical thread messages from ${threadId}`
            );
        }
    }

    return NextResponse.json(validMessages);
}
