-- Backfill only persisted default chat titles from data the product already owns.
-- Existing custom titles, messages, task bindings, statuses, and list ordering stay unchanged.

ALTER TABLE public.chat_threads
    DISABLE TRIGGER update_chat_threads_updated_at;

WITH default_threads AS (
    SELECT
        thread.id,
        CASE
            WHEN NULLIF(BTRIM(task.video_title), '') IS NOT NULL
                AND LOWER(BTRIM(task.video_title)) NOT IN ('unknown', 'untitled')
                THEN BTRIM(task.video_title)
        END AS video_title,
        first_user.content AS first_user_content
    FROM public.chat_threads AS thread
    LEFT JOIN public.tasks AS task
        ON task.id = thread.task_id
    LEFT JOIN LATERAL (
        SELECT message.content
        FROM public.chat_messages AS message
        WHERE message.thread_id = thread.id
          AND message.role = 'user'
        ORDER BY message.created_at ASC
        LIMIT 1
    ) AS first_user ON TRUE
    WHERE thread.title = 'New Chat'
),
extracted AS (
    SELECT
        id,
        video_title,
        NULLIF(BTRIM(
            CASE
                WHEN JSONB_TYPEOF(first_user_content) = 'array' THEN COALESCE((
                    SELECT part ->> 'text'
                    FROM JSONB_ARRAY_ELEMENTS(first_user_content) AS part
                    WHERE part ->> 'type' = 'text'
                      AND NULLIF(BTRIM(part ->> 'text'), '') IS NOT NULL
                    LIMIT 1
                ), '')
                WHEN JSONB_TYPEOF(first_user_content) = 'string'
                    THEN first_user_content #>> '{}'
                ELSE ''
            END
        ), '') AS first_user_text
    FROM default_threads
),
raw_candidates AS (
    SELECT
        id,
        CASE
            WHEN video_title IS NOT NULL THEN video_title
            WHEN NULLIF(
                BTRIM(REGEXP_REPLACE(first_user_text, 'https?://[^[:space:]]+', ' ', 'gi')),
                ''
            ) IS NOT NULL THEN
                BTRIM(REGEXP_REPLACE(first_user_text, 'https?://[^[:space:]]+', ' ', 'gi'))
            WHEN first_user_text ~* '^https?://([^/]*\.)?(youtube\.com|youtu\.be)/' THEN
                COALESCE(
                    'YouTube · ' || COALESCE(
                        SUBSTRING(first_user_text FROM '[?&]v=([A-Za-z0-9_-]+)'),
                        SUBSTRING(first_user_text FROM 'youtu\.be/([A-Za-z0-9_-]+)'),
                        SUBSTRING(first_user_text FROM 'youtube\.com/shorts/([A-Za-z0-9_-]+)'),
                        SUBSTRING(first_user_text FROM 'youtube\.com/live/([A-Za-z0-9_-]+)')
                    ),
                    first_user_text
                )
            ELSE first_user_text
        END AS raw_title
    FROM extracted
),
normalized AS (
    SELECT
        id,
        NULLIF(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(BTRIM(raw_title), '^[[:space:]#>*_`"]+', ''),
                    '[[:space:]#>*_`"]+$',
                    ''
                ),
                '[[:space:]]+',
                ' ',
                'g'
            ),
            ''
        ) AS title
    FROM raw_candidates
    WHERE raw_title IS NOT NULL
),
candidates AS (
    SELECT
        id,
        CASE
            WHEN CHAR_LENGTH(title) <= 48 THEN title
            ELSE LEFT(title, 47) || '…'
        END AS title
    FROM normalized
    WHERE title IS NOT NULL
)
UPDATE public.chat_threads AS thread
SET title = candidate.title
FROM candidates AS candidate
WHERE thread.id = candidate.id
  AND thread.title = 'New Chat';

ALTER TABLE public.chat_threads
    ENABLE TRIGGER update_chat_threads_updated_at;
