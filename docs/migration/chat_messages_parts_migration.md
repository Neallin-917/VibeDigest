# Chat Message Parts Migration

This runbook covers the cleanup path for historical `public.chat_messages` rows so stored `content` matches the current AI SDK v6 `UIMessage.parts` shape.

## What the migration does

- Converts legacy plain-text message bodies into a single text part:
  - `hello` -> `[{"type":"text","text":"hello"}]`
- Unwraps older message envelopes that still store `content` or `parts` inside the `content` column.
- Leaves already-normalized parts arrays unchanged.
- Deletes rows that can never satisfy the UIMessage contract:
  - `content` is not a JSON array
  - `content` is an empty array
  - any part object is missing a string `type`
- If `public.chat_messages.content` is still `text`, the script rewrites rows first and then converts the column to `jsonb`.

## Safe usage

### 1. Dry-run report

Run the script without `--apply` first:

```bash
uv run scripts/migrate_chat_messages_to_parts.py
```

This prints:

- total rows scanned
- rows needing updates
- rows already normalized
- storage shape counts

### 2. Save a machine-readable report

```bash
uv run scripts/migrate_chat_messages_to_parts.py --report-json /tmp/chat-message-migration-report.json
```

Use this when you want a small audit artifact before applying changes.

### 3. Apply the cleanup

```bash
uv run scripts/migrate_chat_messages_to_parts.py --apply
```

The script is idempotent:

- rows already in parts form are skipped
- repeated runs should not rewrite clean rows
- if the column is still `text`, the script upgrades it to `jsonb` after row cleanup

## Notes for operators

- The script uses the database connection configured in `DATABASE_URL`.
- It auto-loads repo-level `.env` / `.env.local` and `backend/.env` / `backend/.env.local` before connecting.
- If a legacy row contains malformed JSON-like content, the script falls back to a text part instead of deleting data.
- Prefer running this during a low-traffic window if the table is large, because the final `ALTER COLUMN ... TYPE jsonb` needs a table rewrite when the column is still `text`.
