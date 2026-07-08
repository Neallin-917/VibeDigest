DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'chat_thread_status'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        ALTER TYPE public.chat_thread_status ADD VALUE IF NOT EXISTS 'archived';
    END IF;
END $$;
