# ADR 0001: Trusted Codex worker for catalog supply

- Status: Accepted
- Date: 2026-08-25

## Context

VibeDigest has two economically and operationally different task classes:
customer submissions and internal public-library supply. Customer jobs must run
on the hosted API runtime. Catalog supply must use the owner's Codex/ChatGPT
subscription without exposing that credential to Railway or making it a ToC
product dependency.

The existing pipeline and Codex adapter already work. The missing boundary was
durable workload identity and an execution policy that survives retries.

## Decision

Persist `tasks.workload_kind` as domain intent:

- `user_submission` routes to PGMQ `video_processing` and the Railway
  `hosted_api` worker with `LLM_RUNTIME=api`.
- `catalog_supply` routes to PGMQ `podcast_supply` and a bounded trusted private
  `trusted_codex` worker with `LLM_RUNTIME=codex_local`.

Canonical private Postgres functions atomically create task/output state,
persist workload identity, send the ID-only message, and create the handoff.
Task and output retries look up the persisted workload and return to its queue.
Workers reload the task and reject any workload outside their capability.

The trusted runner reuses `TaskWorker`, `workflow.py`, and
`CodexLocalChatModel`. Startup reads the Codex account through the SDK and
requires `type=chatgpt`; an API-key session fails closed. Every completed
summary records workload, worker profile, runtime, provider, model, and auth
mode in provenance without storing credentials or email.

Railway cron remains a metadata producer and needs no LLM API key. The initial
trusted location is the owner's machine, invoked through
`make process-podcast-supply`. A future private runner may replace the machine
without changing task schema, queue semantics, or pipeline code.

## Alternatives rejected

1. One queue with environment-only provider switching: retries and operators
   cannot prove which runtime should execute a task, and a hosted worker can
   consume subscription-bound work.
2. A separate podcast pipeline: duplicates workflow, retry, and output logic.
3. Codex authentication on Railway: expands the credential boundary and mixes
   an internal subscription with the hosted product runtime.

## Consequences

- A trusted runner must be online for catalog jobs; queueing remains durable
  while it is offline.
- The catalog batch is deliberately bounded and serial by default.
- CI mocks Codex account state and model calls; it never consumes paid usage.
- Deployments must apply the workload-routing migration before enabling the
  two worker profiles.

## Operational references

- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex account authentication in CI/CD](https://learn.chatgpt.com/docs/auth/ci-cd-auth)
