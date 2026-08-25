# Frontend Codemap

> Last verified: 2026-08-25
> Scope: current Cloud UI implementation, not historical performance analysis

## Product boundary

The frontend is a Next.js App Router application deployed on Vercel. It owns
the browser experience and small session-aware BFF routes. Postgres remains
the task-state authority and Supabase Realtime remains the only live task
transport.

The data flow is intentionally singular:

```text
Browser
  ├── HTTP command ──> Next.js BFF ──> FastAPI ──> Postgres transaction + PGMQ
  └── Realtime subscription <──────────────────── committed task/output changes
```

The browser never polls task status. `frontend/src/lib/task-live.ts` owns the
Supabase Realtime subscription, while Postgres remains the source of truth.

## Stack

| Concern | Implementation |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| UI primitives | shadcn-style local components backed by granular Radix packages |
| Chat | Vercel AI SDK UI |
| Auth/data | Supabase SSR and browser clients |
| Server state | TanStack Query |
| Unit tests | Vitest + Testing Library |
| Browser tests | Playwright |

Exact versions belong to `frontend/package.json` and
`frontend/package-lock.json`, not this codemap.

## Route map

```text
src/app/
├── layout.tsx, page.tsx              # root shell and locale redirect
├── manifest.ts, robots.ts, sitemap.ts
├── [lang]/
│   ├── page.tsx                      # landing page
│   ├── chat/                         # primary chat workspace
│   ├── explore/                      # public task discovery
│   ├── login/ and auth/callback/     # authentication
│   ├── (main)/
│   │   ├── tasks/[id]/               # task result
│   │   ├── settings/                 # account and pricing
│   │   └── policies/                 # authenticated legal routes
│   └── about, faq, privacy, terms
└── api/
    ├── process-video/                # authenticated FastAPI proxy
    ├── chat/                         # streamed AI chat and tools
    ├── tasks/[id]/transcript/        # RLS-scoped, on-demand transcript read
    ├── threads/                      # thread persistence
    ├── image-proxy/                  # constrained media proxy
    └── health/backend-origin/        # deployment diagnostic
```

## Component and state ownership

| Area | Owner | Notes |
| --- | --- | --- |
| Chat workspace | `src/components/chat/` | Conversation UI and task data parts |
| Task presentation | `src/components/tasks/` | Video/audio rendering, Realtime listener, and an on-demand transcript panel that bounds initial DOM work |
| Public podcast library | `src/components/templates/ServerCommunityTemplates.tsx` + `CommunityTemplates.tsx` | Server-filtered 18-item pages, source aggregation, projected card data, responsive editorial/compact layout |
| Inline knowledge blocks | `src/components/chat/KnowledgeUiBlocks.tsx` | Whitelisted table, chart, and steps renderers for validated V5 summary data |
| App shell | `src/components/layout/` | Navigation, sidebar, feedback |
| Shared primitives | `src/components/ui/` | Check here before creating a component; use CVA for variants |
| Server-state hooks | `src/hooks/` | Query keys, tasks, threads, auth-derived behavior |
| Account session state | `src/components/providers.tsx` + `src/hooks/useAccountQueries.ts` | One auth listener updates the shared current-user/profile query cache |
| Backend commands | `src/lib/api.ts` | Typed browser-facing API client |
| Live task events | `src/lib/task-live.ts` | Supabase Realtime only |
| Supabase clients | `src/lib/supabase*.ts` | Browser/public and server credential boundaries |
| Durable chat schema | `src/lib/chat-message-boundary.ts` | Validate request, replay, and persistence boundaries |
| Locale content | `src/lib/i18n.ts` | `en`, `zh`, and `ja` |

Transient loading UI must not be persisted as an empty assistant message. Chat
messages cross the single `chat-message-boundary.ts` validation boundary.

## Rendering rules

- Prefer Server Components for static or server-owned reads.
- Add `"use client"` only for browser APIs, Realtime, state, or interaction.
- Keep command routes thin: authenticate, validate, forward, normalize errors.
- Do not reproduce backend workflow or provider fallback logic in Next.js.
- Keep task loading calm and explicit; avoid decorative skeletons, shimmer, and
  redundant progress surfaces.
- Keep browser-visible errors sanitized through `safe-error.ts`.
- Keep public-library filtering in URL state and Server Components. Load more on
  the same route; do not send every card's complete summary payload to the client.
- Fetch only summary outputs for the first task-detail render. The transcript is
  fetched through the RLS-scoped task route after explicit expansion and is
  rendered in bounded batches on the same page.
- Treat model-selected UI as data, not markup: `summary-contract.ts` validates
  `ui_blocks` again in the browser and `KnowledgeUiBlocks.tsx` renders only the
  approved table, bar-chart, and steps shapes. Malformed blocks disappear while
  the text summary remains readable.

## Validation

```bash
cd frontend
npm run lint
npm run test -- --run
npm run build
```

Run these under Node 24, the runtime declared by `.nvmrc` and
`package.json#engines`.
