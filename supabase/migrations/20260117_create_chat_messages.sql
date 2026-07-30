-- Migration: Create chat_messages table
-- Purpose: Store chat history (messages) for each thread

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id TEXT PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool', 'data')),
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at ON public.chat_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_message_id ON public.chat_messages(thread_id, id);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage messages of their own threads
DROP POLICY IF EXISTS "Users can fully manage own chat messages"
ON public.chat_messages;
CREATE POLICY "Users can fully manage own chat messages"
ON public.chat_messages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.chat_threads
        WHERE id = chat_messages.thread_id
        AND user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.chat_threads
        WHERE id = chat_messages.thread_id
        AND user_id = auth.uid()
    )
);
