-- Reset historical chat data for the AI SDK v6 tool/data-parts cutover.
-- This release intentionally drops backward compatibility with legacy chat payloads.

DELETE FROM public.chat_messages;
DELETE FROM public.chat_threads;
