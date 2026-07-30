-- Durable, transactionally submitted Cloud jobs for video processing.
-- Nothing in this private schema is exposed through Supabase Data API.

create extension if not exists pgmq;
create schema if not exists vibedigest_private;
alter table public.tasks add column if not exists guest_id text;
create table if not exists public.guest_usage (
  guest_id text primary key,
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.guest_usage enable row level security;
revoke all on table public.guest_usage from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues()
    where queue_name = 'video_processing'
  ) then
    perform pgmq.create('video_processing');
  end if;
end
$$;

create table if not exists vibedigest_private.task_queue_handoffs (
  job_id uuid primary key default gen_random_uuid(),
  job_key text not null,
  queue_name text not null,
  message_id bigint not null,
  kind text not null check (kind in ('process_video', 'retry_output')),
  entity_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists task_queue_handoffs_active_job_key
  on vibedigest_private.task_queue_handoffs (job_key)
  where status = 'queued';
create unique index if not exists task_queue_handoffs_queue_message
  on vibedigest_private.task_queue_handoffs (queue_name, message_id);
create index if not exists tasks_authenticated_active_owner_url
  on public.tasks (user_id, video_url, created_at desc)
  where guest_id is null and status in ('pending', 'processing');
create index if not exists tasks_guest_active_owner_url
  on public.tasks (guest_id, video_url, created_at desc)
  where guest_id is not null and status in ('pending', 'processing');
create index if not exists tasks_authenticated_owner_url
  on public.tasks (user_id, video_url, created_at desc)
  where guest_id is null;
create index if not exists tasks_guest_owner_url
  on public.tasks (guest_id, video_url, created_at desc)
  where guest_id is not null;
create index if not exists task_outputs_task_kind_status
  on public.task_outputs (task_id, kind, status);

-- The legacy unique constraint treats NULL locales as distinct. Preserve the
-- best output in each duplicate group before enforcing the intended invariant.
with ranked_outputs as (
  select
    id,
    row_number() over (
      partition by task_id, kind, locale
      order by
        (status = 'completed') desc,
        (
          content is not null
          and nullif(btrim(content::text), '') is not null
        ) desc,
        updated_at desc nulls last,
        created_at desc nulls last,
        id
    ) as retention_rank
  from public.task_outputs
)
delete from public.task_outputs output
using ranked_outputs ranked
where output.id = ranked.id
  and ranked.retention_rank > 1;

alter table public.task_outputs
  drop constraint if exists task_outputs_task_id_kind_locale_key;
create unique index if not exists task_outputs_task_kind_locale_unique
  on public.task_outputs (task_id, kind, locale) nulls not distinct;

revoke all on schema vibedigest_private from public;
revoke all on all tables in schema vibedigest_private
  from public;

-- Trigger-only SECURITY DEFINER functions must not remain callable through RPC.
do $$
declare
  target_function regprocedure;
begin
  for target_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('handle_new_user', 'update_conversation_timestamp')
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target_function
    );
  end loop;
end
$$;

create or replace function vibedigest_private.submit_video_task(
  p_user_id uuid,
  p_video_url text,
  p_guest_id text,
  p_guest_quota_limit integer,
  p_queue_name text default 'video_processing'
)
returns table(task_id uuid, resolution text, message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_guest_usage_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_guest_id, p_user_id::text) || ':' || p_video_url, 0)
  );

  select t.*
    into v_task
    from public.tasks t
   where (
       (p_guest_id is null and t.user_id = p_user_id and t.guest_id is null)
       or (p_guest_id is not null and t.guest_id = p_guest_id)
     )
     and t.video_url = p_video_url
     and t.status in ('pending', 'processing')
   order by t.created_at desc
   limit 1
   for update;

  if found then
    select h.job_id, h.message_id
      into v_job_id, v_message_id
      from vibedigest_private.task_queue_handoffs h
     where h.job_key = 'process:' || v_task.id::text
       and h.status = 'queued'
     limit 1;

    if v_message_id is null then
      v_job_id := gen_random_uuid();
      select pgmq.send(
        p_queue_name,
        jsonb_build_object(
          'version', 1,
          'kind', 'process_video',
          'job_id', v_job_id,
          'task_id', v_task.id
        )
      ) into v_message_id;

      insert into vibedigest_private.task_queue_handoffs (
        job_id, job_key, queue_name, message_id, kind, entity_id
      ) values (
        v_job_id,
        'process:' || v_task.id::text,
        p_queue_name,
        v_message_id,
        'process_video',
        v_task.id
      );
    end if;

    return query select v_task.id, 'reused_inflight'::text, v_message_id;
    return;
  end if;

  select t.*
    into v_task
    from public.tasks t
    join public.task_outputs o on o.task_id = t.id
   where (
       (p_guest_id is null and t.user_id = p_user_id and t.guest_id is null)
       or (p_guest_id is not null and t.guest_id = p_guest_id)
     )
     and t.video_url = p_video_url
     and o.kind = 'script'
     and o.status = 'completed'
     and nullif(btrim(cast(o.content as text)), '') is not null
     and btrim(cast(o.content as text)) <> 'null'
   order by t.created_at desc
   limit 1;

  if found then
    return query select v_task.id, 'reused_completed'::text, null::bigint;
    return;
  end if;

  if p_guest_id is not null then
    insert into public.guest_usage (guest_id, usage_count)
    values (p_guest_id, 1)
    on conflict (guest_id) do update
      set usage_count = public.guest_usage.usage_count + 1,
          updated_at = now()
       where public.guest_usage.usage_count < p_guest_quota_limit
    returning usage_count into v_guest_usage_count;

    if v_guest_usage_count is null then
      return query
        select null::uuid, 'guest_quota_exceeded'::text, null::bigint;
      return;
    end if;
  end if;

  insert into public.tasks (user_id, guest_id, video_url, status, progress)
  values (p_user_id, p_guest_id, p_video_url, 'pending', 0)
  returning * into v_task;

  insert into public.task_outputs (
    task_id, user_id, kind, status, progress, attempt
  )
  select v_task.id, p_user_id, kind, 'pending', 0, 0
    from unnest(array['script', 'summary', 'comprehension_brief']) as kind;

  v_job_id := gen_random_uuid();
  select pgmq.send(
    p_queue_name,
    jsonb_build_object(
      'version', 1,
      'kind', 'process_video',
      'job_id', v_job_id,
      'task_id', v_task.id
    )
  ) into v_message_id;

  insert into vibedigest_private.task_queue_handoffs (
    job_id, job_key, queue_name, message_id, kind, entity_id
  ) values (
    v_job_id,
    'process:' || v_task.id::text,
    p_queue_name,
    v_message_id,
    'process_video',
    v_task.id
  );

  return query select v_task.id, 'created'::text, v_message_id;
end;
$$;

create or replace function vibedigest_private.submit_output_retry(
  p_output_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_queue_name text default 'video_processing'
)
returns table(message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_job_id uuid;
  v_message_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('retry:' || p_output_id::text, 0));

  if not exists (
    select 1
      from public.task_outputs o
      join public.tasks t on t.id = o.task_id
     where o.id = p_output_id
       and o.user_id = p_user_id
       and (
         (p_guest_id is null and t.guest_id is null)
         or (p_guest_id is not null and t.guest_id = p_guest_id)
       )
  ) then
    raise exception 'Output not found or not owned by caller';
  end if;

  select h.message_id
    into v_message_id
    from vibedigest_private.task_queue_handoffs h
   where h.job_key = 'retry:' || p_output_id::text
     and h.status = 'queued'
   limit 1;

  if v_message_id is not null then
    return query select v_message_id;
    return;
  end if;

  update public.task_outputs
     set status = 'pending',
         progress = 0,
         error_message = '',
         updated_at = now()
   where id = p_output_id;

  v_job_id := gen_random_uuid();
  select pgmq.send(
    p_queue_name,
    jsonb_build_object(
      'version', 1,
      'kind', 'retry_output',
      'job_id', v_job_id,
      'output_id', p_output_id
    )
  ) into v_message_id;

  insert into vibedigest_private.task_queue_handoffs (
    job_id, job_key, queue_name, message_id, kind, entity_id
  ) values (
    v_job_id,
    'retry:' || p_output_id::text,
    p_queue_name,
    v_message_id,
    'retry_output',
    p_output_id
  );

  return query select v_message_id;
end;
$$;

create or replace function vibedigest_private.complete_queue_job(
  p_job_id uuid,
  p_queue_name text,
  p_message_id bigint,
  p_status text
)
returns boolean
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_archived boolean;
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Invalid queue terminal status: %', p_status;
  end if;

  select pgmq.archive(p_queue_name, p_message_id) into v_archived;
  if not coalesce(v_archived, false) then
    return false;
  end if;

  update vibedigest_private.task_queue_handoffs
     set status = p_status,
         completed_at = now()
   where job_id = p_job_id
     and queue_name = p_queue_name
     and message_id = p_message_id
     and status = 'queued';

  if not found then
    raise exception 'Queue handoff not found for job %', p_job_id;
  end if;

  return true;
end;
$$;

create or replace function vibedigest_private.fail_invalid_queue_message(
  p_queue_name text,
  p_message_id bigint
)
returns boolean
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_archived boolean;
begin
  select pgmq.archive(p_queue_name, p_message_id) into v_archived;
  if not coalesce(v_archived, false) then
    return false;
  end if;

  update vibedigest_private.task_queue_handoffs
     set status = 'failed',
         completed_at = now()
   where queue_name = p_queue_name
     and message_id = p_message_id
     and status = 'queued';

  return true;
end;
$$;

revoke all on function vibedigest_private.submit_video_task(
  uuid, text, text, integer, text
) from public;
revoke all on function vibedigest_private.submit_output_retry(
  uuid, uuid, text, text
) from public;
revoke all on function vibedigest_private.complete_queue_job(
  uuid, text, bigint, text
) from public;
revoke all on function vibedigest_private.fail_invalid_queue_message(
  text, bigint
) from public;
