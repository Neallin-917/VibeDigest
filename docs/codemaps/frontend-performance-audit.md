# Frontend Performance Audit

> Last Verified: 2026-07-31
> Scope: frontend performance audit, hotspot ranking, and implementation roadmap

## Purpose

This document is the system audit for frontend performance in `frontend/`. It answers three questions:

1. Which framework should we use to evaluate frontend performance in this codebase
2. Which modules have the highest performance impact or resource cost
3. Which modules are engineering-heavy enough that optimization work is non-trivial

This audit follows an Industry Standard bias for Next.js App Router systems:

- Prefer Server Components where possible
- Keep client boundaries narrow
- Lazy-load heavy client-only modules
- Minimize repeated renders on interactive screens
- Reduce long-lived subscriptions and oversized global dependencies

## Evidence Baseline

The conclusions below are grounded in these repository facts:

| Signal | Current Fact |
| --- | --- |
| Framework | Next.js 16.2.12 App Router + React 19 |
| Data layer | React Query + Supabase Realtime |
| Build status | `cd frontend && npm run build` passes |
| Route rendering | Core product routes are dynamic (`/[lang]/chat`, task detail, settings, explore) |
| Client surface | `73` files use `"use client"` |
| `use client` hotspots | `components/chat` 19, `components/ui` 9, `app/[lang]` 9, `components/tasks` 7, `components/layout` 7, `components/landing` 7 |
| Large files | `src/lib/i18n.ts` 1417 LOC, `VideoDetailPanel.tsx` 623 LOC, `code-block.tsx` 562 LOC, `useThreadNavigation.ts` 463 LOC, `ChatContainer.tsx` 410 LOC |
| Heavy imports observed | `framer-motion`, `react-markdown`, `shiki`, `@tanstack/react-query`, `@supabase/supabase-js`, `next/navigation`, `sonner`, Vercel analytics |

## Current Verified Interventions

The 2026-07-31 chat-entry passes narrowed the critical client graph in two
stages:

1. Raw code remains readable immediately, while Shiki syntax highlighting is
   loaded only when a code block needs it.
2. Markdown and tool-message rendering is omitted from a fresh chat entry and
   starts loading as soon as the user submits. The download runs in parallel
   with direct-submit or chat network work, while unauthenticated users avoid
   the download and existing conversations load the renderer automatically.

| Stage | Before | After | Change |
| --- | ---: | ---: | ---: |
| Defer Shiki | 419,553 bytes | 380,823 bytes | -38,730 bytes (-9.2%) |
| Defer message rendering | 380,823 bytes | 336,030 bytes | -44,793 bytes (-11.8%) |
| Cumulative `/[lang]/chat` entry JavaScript, gzip | 419,553 bytes | 336,030 bytes | -83,523 bytes (-19.9%) |

The same pass removed a submission race at route entry: pending landing/login
messages now wait for the browser session to resolve, while every login method
preserves the intended chat destination.

## Current Thread-Opening Intervention

A signed-in production cold switch to a non-prefetched, message-heavy thread
was measured at 3,132 ms on commit `b947660`. The thread-opening path now uses
the data already present in the sidebar and removes avoidable serial work:

- Known `task_id` values come from the cached thread list instead of a second
  BFF request.
- The messages route reads `chat_messages` directly under its existing
  ownership RLS policy and indexed `thread_id, created_at` access path, instead
  of first issuing a duplicate ownership query.
- Pointer/focus intent and direct selection start loading the deferred message
  renderer alongside the thread payload rather than after the payload arrives.

The fallback metadata request remains available for callers whose thread model
does not include `task_id`; no new cache, endpoint, or state layer was added.

## Current Intent-Based Prefetch Intervention

Production measurements on 2026-07-31 showed a completed demo taking
3.7–5.3 seconds to become ready across five direct openings. Each opening also
fetched message payloads for the active thread plus the three most recent
unrelated threads, creating four message reads before the user expressed any
navigation intent.

Automatic idle prefetching was removed. Desktop and mobile thread items still
prefetch on pointer hover and keyboard focus, so likely navigation remains
warmed while each direct chat opening avoids three speculative message reads.
This follows the Next.js resource-usage guidance to prefer intent-triggered
prefetching when automatic prefetch would download data the user may never use.

## Current Tool-State Intervention

Production evidence on commit `25b1f47` showed failed video-preview and
task-creation cards presenting `Completed` alongside `Error`, with fallback
success content such as an untitled video or a task-created message. These
expected business errors now resolve to one error state and suppress success
placeholders. The change stays inside the existing tool-card components and is
covered at both component and browser-flow levels.

## Current Analytics Intervention

A 2026-07-31 mobile Lighthouse baseline on production measured performance at
`67` for the landing route and `68` for the fresh chat route. Both routes
downloaded the `gtag.js` payload even though Vercel Analytics and Speed Insights
already owned product traffic and real-user performance measurement.

The duplicate Google Analytics integration and its public environment contract
were removed. This removes roughly `167 KiB` of third-party transfer from every
route in the measured production build while preserving the existing product
analytics and Web Vitals surfaces. Google One Tap remains unchanged because its
authentication benefit should not be traded away without conversion evidence.

## Audit Framework

The frontend is assessed across four layers:

| Layer | What it covers |
| --- | --- |
| Shell | `app/layout.tsx`, `[lang]/layout.tsx`, global providers, fonts, analytics, theme, i18n, toaster |
| Route | Landing, Chat, Explore, Settings, Task Detail route behavior and rendering responsibilities |
| Feature | Chat, Task Detail, Sidebar/Thread Navigation, Auth, Landing sections |
| Infra | React Query, Supabase Realtime, URL sync, lazy loading, markdown/code rendering, fonts, third-party packages |

Each item is scored from `1` to `5` on these dimensions:

| Dimension | Meaning |
| --- | --- |
| First-load cost | SSR/CSR boundary, hydration cost, initial JS, fonts, global scripts |
| Interaction cost | Re-render frequency, state fan-out, animation cost, layout churn, scroll-region work |
| Sustained cost | Realtime subscriptions, refetch behavior, cache residency, long-lived state |
| Bundle cost | Heavy imports, client import chain length, lazy-load effectiveness |
| Engineering complexity | Coupling, state coordination, refactor risk, debugging difficulty |

Scoring interpretation:

- `5`: severe or highly influential
- `4`: high
- `3`: medium
- `2`: low
- `1`: minimal

Priority rules:

- `P0`: affects a core path and likely yields clear wins
- `P1`: meaningful cost or complexity, but not the first intervention
- `P2`: valid optimization candidate, lower leverage

## Layer Summary

| Layer | Main finding | Priority |
| --- | --- | --- |
| Shell | Global client boundary is wider than necessary because providers, toaster, theme, and analytics sit below `[lang]/layout.tsx` and participate in every route | P0 |
| Route | Chat is the dominant product path and also the densest client-render surface; landing is secondary and mostly first-load/animation focused | P0 |
| Feature | Chat and Video Detail are the highest-cost interactive areas; thread navigation is the highest state-complexity area | P0 |
| Infra | Large inline i18n payload and mixed concerns around markdown/rendering/subscription infra create avoidable bundle and maintenance pressure | P1 |

## Route Matrix

| Route group | Render mode | Performance note | Priority |
| --- | --- | --- | --- |
| `/[lang]/chat` | Dynamic | Highest client-state density, route-level suspense fallback, sidebar + workspace + detail panel all active on core path | P0 |
| `/[lang]/tasks/[id]` and `/[lang]/tasks/[id]/[slug]` | Dynamic | Content-heavy detail pages; slug route uses markdown rendering in the server page, but still depends on complex task content | P1 |
| `/[lang]/explore` | Dynamic | Not enough evidence of major hotspot yet; likely moderate | P2 |
| `/[lang]/settings` and pricing | Dynamic | Lower traffic and less sustained interactivity than chat | P2 |
| Landing and marketing pages | Dynamic locale route | Main risk is client JS and animation on first load, not long-lived runtime cost | P1 |

## Hotspot Cards

### P0. Chat Workspace Chain

**Modules:** `ChatPageClient`, `ChatWorkspace`, `ChatContainer`, `MessageRow`

**Responsibility**

- Owns the primary product path
- Composes sidebar-driven thread switching, chat transport, streaming UI, task panel opening, mobile drawers, and message rendering

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 4 | Chat route is dynamic and client-heavy; sidebar, workspace, drawers, header, sheet, and transport logic load on the core route |
| Interaction cost | 5 | Streaming messages, scroll management, message list rendering, panel toggling, and mobile/desktop branching all share one interactive surface |
| Sustained cost | 4 | Active chat sessions maintain message history, query state, and task selection state over time |
| Bundle cost | 4 | Pulls in `@ai-sdk/react`, `framer-motion`, `react-markdown`, UI components, and navigation hooks |
| Engineering complexity | 5 | State spans URL, thread, task, auth, initial hydration, direct URL submission, panel opening, and message rendering |

**Trigger scenarios**

- Opening `/[lang]/chat`
- Switching threads
- Streaming assistant responses
- Opening task details from tool/data parts
- Mobile navigation and drawer usage

**Resource cost shape**

- High-frequency re-render surface
- Scroll container repaint cost
- Markdown rendering per message
- State fan-out from `ChatContainer` into message rows and task group rendering

**Current design complexity**

- `ChatContainer` owns transport, auth gating, local persistence, direct-submit branching, scroll, and auto-open side effects
- `ChatWorkspace` mixes panel resizing, mobile detection, routing, dynamic import, and layout orchestration
- `MessageRow` is memoized, but markdown and tool/data rendering still sit on the hot path

**Optimization direction**

- Further narrow the chat route client boundary so more static shell stays server-rendered
- Split chat orchestration from rendering concerns
- Defer non-critical client subtrees on first entry to the chat route
- Audit whether markdown rendering can be scoped more tightly to message types that need it
- Evaluate virtualization or segmented rendering if message count grows materially

**Expected benefit**

- Better input responsiveness
- Lower hydration and route-entry JS cost
- Less rerender spillover during streaming and thread switching

**Difficulty**

- High, because state ownership is spread across several cooperating components

**Rank**

- `P0`

### P0. Video Detail Panel

**Module:** `VideoDetailPanel`

**Responsibility**

- Displays video context, summary structures, media seeking, realtime task updates, and animated collapsible sections

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 3 | It is dynamically imported in `ChatWorkspace`, which helps, but it is still a large client-only module |
| Interaction cost | 4 | Rich UI, media interactions, animated cards, expandable sections, and mixed content rendering |
| Sustained cost | 5 | Subscribes to realtime task changes and stays mounted during task-focused reading sessions |
| Bundle cost | 4 | Imports Supabase realtime types, media player logic, motion, and complex parsing helpers |
| Engineering complexity | 5 | Combines subscription, normalization/parsing, UI composition, and media control in one file |

**Trigger scenarios**

- Opening a task panel from chat
- Following live task progress
- Reading and navigating structured summary sections
- Seeking media from summary/keypoint references

**Resource cost shape**

- Long-lived subscription cost
- CPU work from summary normalization/parsing
- Layout work from animated disclosure patterns
- Memory residency while panel remains open

**Current design complexity**

- One module owns realtime IO, parsing, presentation, and interaction logic
- The file size itself is a maintenance smell for future performance work

**Optimization direction**

- Separate data subscription from summary parsing and presentational sections
- Move parsing/normalization helpers into dedicated modules and memoize by payload identity
- Reassess where animation adds real value versus extra layout work

**Expected benefit**

- Lower sustained CPU work
- Easier profiling and targeted optimization
- Reduced regression risk during future feature additions

**Difficulty**

- High, because refactoring affects data flow and UI behavior together

**Rank**

- `P0`

### P0. Thread Navigation and Query Coordination

**Modules:** `useThreadNavigation`, `useThreadsQuery`, `useThreadPayload`

**Responsibility**

- Synchronizes thread/task URL state
- Prefetches payloads
- Loads cached thread messages
- Coordinates bootstrap, selection, navigation safety, and optimistic new-thread behavior

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 3 | Bootstrap logic runs early on the chat route and can gate what the user sees |
| Interaction cost | 4 | Thread switching touches URL, local state, payload fetch, cache, and UI overlays |
| Sustained cost | 4 | React Query caches thread payloads for minutes and keeps coordination logic alive during chat sessions |
| Bundle cost | 3 | Query and navigation dependencies are moderate, but always relevant on the chat path |
| Engineering complexity | 5 | URL sync, cycle detection, bootstrap guards, fallback IDs, and payload coordination are tightly coupled |

**Trigger scenarios**

- Initial chat boot
- Opening a task-linked thread
- Selecting a thread from sidebar or mobile drawer
- Creating or resolving a thread for a task

**Resource cost shape**

- Repeated fetch/query coordination
- Cache residency for threads and payloads
- UI state churn from bootstrap and switching states

**Current design complexity**

- The hook behaves like a route-level state machine
- Multiple refs exist to stabilize callbacks and suppress effect churn
- Navigation correctness and performance are linked, which raises refactor risk

**Optimization direction**

- Separate URL policy from data loading policy
- Define a smaller state machine contract for bootstrap and thread switch flows
- Revisit cache invalidation and prefetch rules with explicit budget limits

**Expected benefit**

- More predictable chat route behavior
- Lower risk of accidental rerenders or duplicated work
- Easier future optimization of thread switching latency

**Difficulty**

- High, because correctness constraints are embedded in the current design

**Rank**

- `P0`

### P1. Global Shell Boundary

**Modules:** `providers.tsx`, `[lang]/layout.tsx`

**Responsibility**

- Installs QueryClient, theme provider, i18n provider, toaster, analytics, speed insights, GA, fonts, and shell decorations

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 5 | Every locale route pays for this shell boundary |
| Interaction cost | 2 | Ongoing interaction cost is modest compared with chat |
| Sustained cost | 3 | QueryClient and global providers persist for the whole session |
| Bundle cost | 4 | Pulls React Query, next-themes, i18n context, sonner, analytics hooks |
| Engineering complexity | 4 | Global changes are risky because they affect every route |

**Trigger scenarios**

- Any route under `/[lang]`
- Any session that hydrates provider-backed UI

**Resource cost shape**

- Global hydration boundary
- Global script and provider participation
- Fonts and analytics loaded for all locale routes

**Current design complexity**

- `[lang]/layout.tsx` stays server-rendered, but the child provider cluster is broad
- Analytics, toaster, theme, and i18n all sit close to the root, increasing the always-on surface

**Optimization direction**

- Reassess which providers truly need to be global
- Split route-agnostic shell from route-specific client features
- Keep analytics and other passive integrations from widening interactive boundaries unnecessarily

**Expected benefit**

- Lower baseline route-entry cost across the app
- Cleaner separation between shell and feature-specific interactivity

**Difficulty**

- Medium, because the changes are conceptually clear but globally sensitive

**Rank**

- `P1`

### P1. `lib/i18n.ts`

**Module:** `src/lib/i18n.ts`

**Responsibility**

- Holds locale config and the full translation object for all supported locales

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 4 | Shared locale data participates in provider-backed UI and can inflate client-side work |
| Interaction cost | 1 | Minimal runtime interaction cost after load |
| Sustained cost | 2 | Mostly memory residency and object traversal |
| Bundle cost | 4 | One 1417-line module centralizes all locale content |
| Engineering complexity | 4 | Large monolithic file increases merge conflicts and makes route-level splitting harder |

**Trigger scenarios**

- Any route that consumes `I18nProvider`
- Any component that reads translated strings on the client

**Resource cost shape**

- Larger module payload
- Memory residency of all locale dictionaries together

**Current design complexity**

- Locale content and locale infrastructure are co-located
- Difficult to split or lazy-load without explicit structure changes

**Optimization direction**

- Split locale dictionaries by locale and possibly by route domain
- Keep type-safe accessors, but move content out of a single monolith

**Expected benefit**

- Lower bundle pressure
- Better maintainability
- Easier future server-first translation loading

**Difficulty**

- Medium, because the logic is simple but the migration touches many call sites

**Rank**

- `P1`

### P1. Landing Animation Group

**Modules:** `HeroSection`, `FeaturesSection`, `HowItWorksSection`, `PricingSection`, `TestimonialsSection`, `SupportCTA`, `LandingNav`, `CommunityTemplates`

**Responsibility**

- Own the marketing and acquisition experience on the locale landing page

**Risk profile**

| Dimension | Score | Notes |
| --- | --- | --- |
| First-load cost | 4 | Several landing components are client components and import `framer-motion` |
| Interaction cost | 2 | Interaction density is low after initial load |
| Sustained cost | 1 | Minimal long-lived cost |
| Bundle cost | 3 | Motion and client nav logic accumulate across sections |
| Engineering complexity | 2 | Simpler than chat and task flows |

**Trigger scenarios**

- First visit to the product
- Mobile landing page load

**Resource cost shape**

- Animation-driven hydration and initial JS cost
- Decorative effects competing with acquisition latency

**Current design complexity**

- Multiple isolated animated sections instead of one focused interactive boundary

**Optimization direction**

- Reduce client-only sections on landing pages
- Prefer CSS or server-rendered static presentation where possible
- Keep only the interactions that materially change conversion or clarity

**Expected benefit**

- Faster landing-page startup and less mobile overhead

**Difficulty**

- Low to medium

**Rank**

- `P1`

### P2. Settings, Auth, and Secondary Routes

**Modules:** settings pages, login flow, smaller UI primitives on non-core routes

**Responsibility**

- Support account and preference workflows

**Why not higher**

- These areas are not the main sustained runtime cost center
- They still inherit shell cost, but are not the first leverage point for performance work

**Rank**

- `P2`

## Non-Trivial Engineering Zones

These areas should be treated as design-heavy optimization work rather than tactical cleanup:

1. Chat rendering chain
   - `AI SDK` transport
   - message parts
   - markdown/tool/data rendering
   - task-panel opening side effects

2. Video detail mixed responsibilities
   - realtime subscription
   - structured summary parsing
   - media control
   - animated presentation

3. Thread navigation state machine
   - URL sync
   - bootstrap rules
   - prefetch
   - cache invalidation
   - fallback thread handling

4. i18n packaging
   - one monolithic translation file
   - currently easy to use, but costly to split later

5. Global shell boundary
   - provider lifetime
   - analytics integrations
   - root-level client state and hydration footprint

## Priority Conclusion

### P0

- Chat workspace chain
- Video detail panel
- Thread navigation and query coordination

These are the first modules to optimize because they sit on the core product path and combine high runtime cost with high engineering leverage.

### P1

- Global shell boundary
- `lib/i18n.ts`
- Landing animation group

These are meaningful but should follow once the chat path is decomposed and the highest-value runtime work is underway.

### P2

- Settings, auth, and secondary non-core route refinements

## Roadmap

### Phase 1: Low-Risk, High-Return

- Shrink unnecessary client boundaries around shell and route entry points
- Identify global dependencies that do not need to participate in every route
- Reduce first-entry cost on the chat route by deferring non-critical client subtrees
- Audit landing-page motion and remove decorative interactivity that does not justify hydration

### Phase 2: Medium-Risk Structural Work

- Split chat orchestration from rendering and transport concerns
- Split `VideoDetailPanel` into subscription, parsing, and presentational sections
- Clarify thread navigation state ownership and query cache policy
- Break `i18n.ts` into a structure that supports smaller loading surfaces

### Phase 3: Governance and Long-Term Control

- Define route-level performance budgets for chat and landing
- Add profiling baselines for route entry, thread switch, and panel open flows
- Add a frontend performance review checklist for new client components and new realtime logic
- Track `use client` surface area and large-file growth as maintainability signals

## Recommended Metrics for Follow-Up

When implementation begins, measure these before and after:

| Flow | Metrics |
| --- | --- |
| Chat route entry | route JS, hydration time, first input delay, sidebar ready time |
| Thread switching | time to visible title, time to messages rendered, duplicate fetch count |
| Video panel open | panel open latency, subscription setup time, summary parse time |
| Landing load | initial JS, LCP, CLS, motion-related scripting cost |
| Global shell | provider count, root client bundle size, analytics/script cost |

## Decision Summary

If only one frontend subsystem is addressed first, it should be the chat stack, not the landing page and not generic bundle cleanup.

Reason:

- It is the main product path
- It carries the largest concentration of client state
- It combines hydration cost, rerender cost, and sustained session cost
- Improvements there will also force cleaner boundaries for task detail and thread navigation
