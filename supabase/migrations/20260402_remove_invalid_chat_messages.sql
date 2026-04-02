-- Remove invalid chat_messages rows that cannot satisfy the AI SDK v6 UIMessage.parts contract.
-- These rows are typically empty assistant placeholders or malformed legacy payloads.

DELETE FROM public.chat_messages
WHERE content IS NULL
   OR jsonb_typeof(content) <> 'array'
   OR jsonb_array_length(content) = 0
   OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(content) AS part
       WHERE jsonb_typeof(part) <> 'object'
          OR NOT (part ? 'type')
          OR jsonb_typeof(part->'type') <> 'string'
   );
