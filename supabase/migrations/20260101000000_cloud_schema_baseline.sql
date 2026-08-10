-- Cloud schema baseline for environments created from this repository.
-- Supabase supplies auth.users and auth.uid(); application tables live here.

do $$
begin
  create type public.subscription_tier as enum ('free', 'pro');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.chat_thread_status as enum ('active', 'archived', 'deleted');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  creem_customer_id text unique,
  tier public.subscription_tier not null default 'free',
  usage_count integer not null default 0 check (usage_count >= 0),
  usage_limit integer not null default 3 check (usage_limit >= 0),
  extra_credits integer not null default 0 check (extra_credits >= 0),
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id text,
  video_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'error')),
  progress integer not null default 0 check (progress between 0 and 100),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  video_title text,
  thumbnail_url text,
  is_deleted boolean not null default false,
  is_demo boolean not null default false,
  author text,
  author_url text,
  author_image_url text,
  description text,
  keywords text[],
  view_count bigint,
  upload_date timestamptz,
  duration integer check (duration is null or duration >= 0),
  output_intent jsonb not null default '{}'::jsonb
);

create table if not exists public.task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  locale text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'error')),
  progress integer not null default 0 check (progress between 0 and 100),
  content text,
  error_message text,
  attempt integer not null default 0 check (attempt >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  intent jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb
);

create table if not exists public.guest_usage (
  guest_id text primary key,
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.guest_usage enable row level security;
revoke all on table public.guest_usage from anon, authenticated;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  amount_fiat numeric,
  currency_fiat text default 'USD',
  amount_crypto numeric,
  currency_crypto text,
  status text default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null default 'New Chat',
  status public.chat_thread_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

create index if not exists idx_tasks_user_id
  on public.tasks (user_id);
create index if not exists idx_tasks_is_demo
  on public.tasks (is_demo)
  where is_demo = true;
create index if not exists idx_task_outputs_task_id
  on public.task_outputs (task_id);
create index if not exists idx_task_outputs_user_id
  on public.task_outputs (user_id);
create unique index if not exists task_outputs_task_kind_locale_unique
  on public.task_outputs (task_id, kind, locale) nulls not distinct;
create index if not exists idx_payment_orders_provider_id
  on public.payment_orders (provider_payment_id);
create index if not exists idx_chat_threads_list_visible
  on public.chat_threads (user_id, task_id, updated_at desc)
  where status <> 'deleted';

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_outputs enable row level security;
alter table public.payment_orders enable row level security;
alter table public.chat_threads enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Auth can view own tasks or demo" on public.tasks;
create policy "Auth can view own tasks or demo"
  on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id or is_demo = true)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Anon can view demo tasks" on public.tasks;
create policy "Anon can view demo tasks"
  on public.tasks for select to anon
  using (is_demo = true);

drop policy if exists "Auth can view own task outputs or demo"
  on public.task_outputs;
create policy "Auth can view own task outputs or demo"
  on public.task_outputs for all to authenticated
  using (
    exists (
      select 1
      from public.tasks
      where tasks.id = task_outputs.task_id
        and (tasks.user_id = (select auth.uid()) or tasks.is_demo = true)
    )
  )
  with check (
    exists (
      select 1
      from public.tasks
      where tasks.id = task_outputs.task_id
        and tasks.user_id = (select auth.uid())
    )
  );

drop policy if exists "Anon can view demo task outputs" on public.task_outputs;
create policy "Anon can view demo task outputs"
  on public.task_outputs for select to anon
  using (
    exists (
      select 1
      from public.tasks
      where tasks.id = task_outputs.task_id
        and tasks.is_demo = true
    )
  );

drop policy if exists "Users can view own orders" on public.payment_orders;
create policy "Users can view own orders"
  on public.payment_orders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can fully manage own threads"
  on public.chat_threads;
create policy "Users can fully manage own threads"
  on public.chat_threads for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_chat_threads_updated_at on public.chat_threads;
create trigger update_chat_threads_updated_at
  before update on public.chat_threads
  for each row execute procedure public.update_updated_at_column();
