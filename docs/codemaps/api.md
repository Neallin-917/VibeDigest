# API Codemap

> Last verified: 2026-07-30
> Owner: Cloud command/API contract

## Boundaries

- Canonical public API: `https://api.vibedigest.io`
- Vercel server routes may use `BACKEND_ORIGIN_URL` for direct Railway calls.
- Bearer users use Supabase access tokens.
- Guest commands require `X-Guest-Id`; guest ownership is stored on `tasks.guest_id`.
- Long-running work is never executed by an HTTP request handler.

## Video commands

### `POST /api/process-video`

Form field: `video_url`.

The route validates identity and URL, then calls the private transactional
submission boundary. Task creation, guest usage, output placeholders, active
handoff registration, and `pgmq.send` either all commit or all roll back.

Successful responses:

```json
{"task_id":"uuid","message":"Task queued"}
{"task_id":"uuid","message":"Task already in progress"}
{"task_id":"uuid","message":"Task already processed"}
```

Errors: `400` invalid URL, `401` identity missing/invalid, `402` guest quota,
`503` transactional queue submission unavailable.

### `POST /api/retry-output`

Form field: `output_id`. Ownership is checked through the parent task. Resetting
the output and sending the retry message happen in one private Postgres
transaction.

Response: `{"message":"Retry queued"}`. Queue failure returns `503` without a
partial pending state.

### `GET /api/tasks/{task_id}/status`

Returns current task state after bearer or guest ownership validation. The
frontend uses Supabase Realtime for progress; this endpoint is a direct read,
not a polling transport.

### `PATCH /api/tasks/{task_id}`

Updates `video_title` after owner validation.

## Other surfaces

- `/api/create-checkout-session`, `/api/create-crypto-charge`: payment commands.
- `/api/webhook/creem`, `/api/webhook/coinbase`: signed payment webhooks.
- `/health`: Railway health probe.

Route implementation is owned by `backend/api/routes/`; exact request code is
the final source of truth when this codemap and implementation disagree.
