# Operations daily report

The operations daily report is a read-only view of registered-user acquisition,
activation, product usage, task reliability, and the currently trustworthy part
of the payment funnel.

## Run

Apply the canonical Supabase migrations first. Then run against the intended
database:

```bash
uv run python backend/scripts/generate_ops_daily_report.py
```

The default report covers the previous `Asia/Shanghai` calendar day and writes
an HTML file under `.reports/ops-daily/`. Use `--date YYYY-MM-DD`, `--timezone`,
`--format json`, or `--output PATH` when needed. The database transaction is
explicitly read-only.

## Exclusion contract

Core metrics include only registered users and tasks satisfying all of these
conditions:

- `guest_id IS NULL`
- `workload_kind = 'user_submission'`
- `is_demo = false`
- `is_deleted = false`
- the owner is not in `vibedigest_private.ops_excluded_users`

The private exclusion table is the owner for internal, development, test, and
acceptance identities. Do not infer exclusions from email domains, URL patterns,
or unusually high usage. Those heuristics can remove legitimate customers.
The reserved guest database identity is excluded automatically.

Before the first production report, review every known internal identity and
record its user UUID with a reason:

```sql
insert into vibedigest_private.ops_excluded_users (user_id, reason, note)
values ('00000000-0000-0000-0000-000000000000', 'internal_development', 'owner reviewed');
```

Removing an identity from the table restores its full history to later report
runs. Never store access tokens, credentials, or private user content in the
reason or note fields.

Production generation fails closed when the reviewed exclusion table is empty.
`--allow-empty-exclusions` exists only for a known-clean non-production database.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Total registered users | Eligible `auth.users` created before the report-day end |
| New registered users | Eligible `auth.users` created during the report day |
| Active registered users | Distinct eligible users with an Agent turn or valid user task during the day |
| 24h activation | Prior-day signup cohort with a completed user task within 24 hours of signup |
| User tasks | Valid user tasks created during the report day |
| Terminal success rate | Completed divided by completed plus failed tasks from the report-day task cohort |
| Completion latency | Time from task creation to its completed update, reported as P50 and P90 |
| Confirmed checkout volume | Fiat amount on orders entering `completed`; not net revenue |

The activation cohort intentionally lags one day so every included signup has a
full 24-hour opportunity to activate.

## Known limits

- Guest traffic is excluded from the core report because historical guest
  activity cannot be reliably separated from local and acceptance traffic.
- `payment_orders` does not contain a durable product/billing classification or
  complete renewal/refund ledger. Confirmed checkout volume must not be labeled
  revenue, MRR, or net revenue.
- Vercel Analytics growth events are not joined into this database report. Page
  views, result views, and aggregate pricing CTA events remain a separate
  acquisition surface until a reviewed integration is added.
- Historical Agent-turn metrics begin when `vibedigest_private.agent_turns` was
  introduced; do not compare earlier periods as if coverage were unchanged.
