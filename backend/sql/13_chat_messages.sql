-- 13_chat_messages.sql

-- 1. Create Messages Table
-- Uses JSONB for content to support AI SDK v6 "parts" (text, tool calls, images)
-- Uses atomic append-only persistence (no full transcript rewriting)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY, -- Changed from UUID to TEXT to support AI SDK string IDs
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool', 'data')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Indexes for efficient querying
-- Frequent query: Get all messages for a thread, ordered by time
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at
ON public.chat_messages(thread_id, created_at);

-- Support looking up specific message if needed
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_message_id
ON public.chat_messages(thread_id, id);

-- 3. RLS Policies
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can fully manage own chat messages"
ON public.chat_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.chat_threads
    WHERE chat_threads.id = chat_messages.thread_id
    AND chat_threads.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_threads
    WHERE chat_threads.id = chat_messages.thread_id
    AND chat_threads.user_id = auth.uid()
  )
);
