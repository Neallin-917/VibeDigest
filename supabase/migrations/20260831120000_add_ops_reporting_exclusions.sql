-- Operations reports must exclude known internal, development, test, and
-- acceptance accounts without relying on email-pattern heuristics.
create table if not exists vibedigest_private.ops_excluded_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (length(btrim(reason)) > 0),
  note text,
  created_at timestamptz not null default now()
);

comment on table vibedigest_private.ops_excluded_users is
  'Explicit user-level exclusions applied to all historical and future operations reporting.';

revoke all on table vibedigest_private.ops_excluded_users
  from public, anon, authenticated;
