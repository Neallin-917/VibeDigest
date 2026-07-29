# Version Changelog

Historical record of major version changes. For current architecture, see [AGENTS.md](AGENTS.md).

---

## Unreleased

- **CI Reliability**: Updated stale V4 summary fixtures and mocked the comprehension
  boundary so backend and end-to-end workflow tests exercise the current contract
- **Dependency Security**: Patched production vulnerabilities in Next.js, Sharp,
  PostCSS, and LiteLLM; regenerated the Python dependency lock
- **Supply-Chain Maintenance**: Added weekly grouped Dependabot updates for npm,
  Python, and GitHub Actions
- **CI Hardening**: Removed the failure-log-driven agent step that installed and
  ran a third-party CLI with repository write-capable tools
- **CI Runtime**: Upgraded first-party GitHub Actions and `setup-uv` to their
  Node 24-compatible major versions, eliminating Node 20 deprecation warnings
- **CI Cache**: Disabled `setup-uv`'s automatic cache because the workflow owns
  the same uv cache explicitly, preventing concurrent cache-save warnings

---

## v3.4 — Chat-First Architecture

- **Core Interface Migration**: `/chat` is now the primary interface, replacing `/dashboard`
- **Route Redirects**: `/dashboard` → `/chat`, `/history` → `/chat?library=open`
- **Mobile Navigation**: Hamburger menu drawer for mobile devices on `/chat` page
- **IconSidebar Enhancement**: User dropdown now includes Settings/Pricing links
- **WelcomeScreen**: Empty state shows community examples for quick start
- **LibrarySidebar**: Enhanced with delete functionality and improved search
- **Deprecated Routes**: `/dashboard` and `/history` now redirect; will be removed in future versions

---

## v3.3 — Pricing & Playback

- **Seekable Playback**: Task detail page supports click-to-seek for YouTube/Bilibili embeds and audio sources
- **Transcript Timeline UX**: Full script rendered as clickable "timeline blocks" from `task_outputs(kind="script_raw")`
- **Supadata Integration**: Optional YouTube transcript fetch via Supadata API (skips heavy download/transcribe)
- **Pricing Model**: `profiles` table tracks credits/usage with `tier`, `usage_count`, `extra_credits`

---

## v3.0 — Major Rewrite

- **Frontend Migration**: Fully rewritten in Next.js 14+ (App Router) & TailwindCSS
- **Backend Migration**: Switched from `faster-whisper` to OpenAI API (Official Endpoint)
- **Core Orchestration**: Migrated to LangGraph & LangChain for robust, stateful video processing
- **Design System**: "Supabase-style" aesthetic (Dark mode, Glassmorphism, Emerald Green accents)
- **Auth**: Web2 Only (Email/Google) via Supabase Auth

---

## v3.1 — Auth Simplification

- **Web3 Login Removed**: Simplified to Email/Google only

---

## Pre-v3

Legacy architecture using `faster-whisper` for local transcription. Superseded by OpenAI API integration.
