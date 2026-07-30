-- Migration: Align chat_messages schema with AI SDK v6 UIMessage.parts storage
-- Purpose:
-- - Make fresh and existing environments agree on id/content types
-- - Preserve legacy plain-text rows during TEXT -> JSONB conversion
-- - Standardize indexes and RLS shape

CREATE OR REPLACE FUNCTION public.try_parse_jsonb(value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN value::jsonb;
EXCEPTION
    WHEN others THEN
        RETURN to_jsonb(value);
END;
$$;

ALTER TABLE public.chat_messages
    ALTER COLUMN id TYPE TEXT USING id::text;

ALTER TABLE public.chat_messages
    ALTER COLUMN id DROP DEFAULT;

DO $$
DECLARE
    current_content_type TEXT;
BEGIN
    SELECT udt_name
    INTO current_content_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'content';

    IF current_content_type IS DISTINCT FROM 'jsonb' THEN
        EXECUTE $sql$
            ALTER TABLE public.chat_messages
            ALTER COLUMN content TYPE JSONB
            USING public.try_parse_jsonb(content)
        $sql$;
    END IF;
END $$;

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.chat_messages
    DROP CONSTRAINT IF EXISTS chat_messages_role_check;

ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'tool', 'data'));

DROP POLICY IF EXISTS "Users can manage messages of their threads" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view messages in own threads" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert messages into own threads" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can fully manage own chat messages" ON public.chat_messages;

CREATE POLICY "Users can fully manage own chat messages"
ON public.chat_messages
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.chat_threads
        WHERE chat_threads.id = chat_messages.thread_id
          AND chat_threads.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.chat_threads
        WHERE chat_threads.id = chat_messages.thread_id
          AND chat_threads.user_id = auth.uid()
    )
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at
ON public.chat_messages(thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_message_id
ON public.chat_messages(thread_id, id);

DROP INDEX IF EXISTS public.idx_chat_messages_thread_created;
DROP INDEX IF EXISTS public.idx_chat_messages_thread_id;

DROP FUNCTION IF EXISTS public.try_parse_jsonb(TEXT);
