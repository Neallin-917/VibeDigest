-- One durable handoff per user turn, not a general-purpose agent workflow engine.
-- Fail promptly rather than holding a production DDL lock behind active work.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Private runtime state is never exposed by PostgREST or Realtime. User-visible
-- receipts and final answers use the existing owner-scoped chat_messages table.
-- A saved background answer also needs an INSERT/UPDATE publication for the
-- browser to receive it. Preserve existing tables and the existing owner RLS;
-- never publish private turn state or execution tokens.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

create table if not exists vibedigest_private.agent_turns (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_message_id text not null references public.chat_messages(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  wait_output_id uuid references public.task_outputs(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'waiting_task', 'finalizing', 'completed', 'failed', 'cancelled')),
  allowed_video_urls text[] not null default '{}',
  runtime_config jsonb not null,
  continuation_queue text not null check (continuation_queue ~ '^agent_answers(_[a-z0-9_]+)?$'),
  execution_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now() + interval '3 minutes',
  error_code text,
  continuation_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, input_message_id)
);
create index if not exists agent_turns_waiting_task on vibedigest_private.agent_turns(task_id)
  where status = 'waiting_task';
create index if not exists agent_turns_thread on vibedigest_private.agent_turns(thread_id, created_at desc);

-- Fixed create slot per turn. The key does not depend on model-generated tool IDs.
create table if not exists vibedigest_private.agent_actions (
  turn_id uuid primary key references vibedigest_private.agent_turns(id) on delete cascade,
  parameters jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);

alter table vibedigest_private.task_queue_handoffs
  drop constraint if exists task_queue_handoffs_kind_check;
alter table vibedigest_private.task_queue_handoffs
  add constraint task_queue_handoffs_kind_check
  check (kind in ('process_video', 'retry_output', 'agent_continue'));

do $$ begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'agent_answers') then
    perform pgmq.create('agent_answers');
  end if;
end $$;

create or replace function vibedigest_private.agent_turn_ready(p_turn_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from vibedigest_private.agent_turns a
    join public.tasks t on t.id = a.task_id
    left join public.task_outputs o on o.id = a.wait_output_id
    where a.id = p_turn_id and (
      t.status in ('error', 'failed') or
      (a.wait_output_id is not null and o.status in ('completed', 'error', 'failed')) or
      (a.wait_output_id is null and t.status = 'completed')
    )
  );
$$;

create or replace function vibedigest_private.enqueue_agent_continuation(p_turn_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_turn vibedigest_private.agent_turns%rowtype;
  v_job uuid;
  v_message bigint;
begin
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id for update;
  if not found or v_turn.status <> 'waiting_task'
    or not vibedigest_private.agent_turn_ready(p_turn_id) then return; end if;
  if exists (select 1 from vibedigest_private.task_queue_handoffs
    where job_key = 'agent:' || p_turn_id::text and status = 'queued') then return; end if;
  v_job := gen_random_uuid();
  select pgmq.send(v_turn.continuation_queue, jsonb_build_object(
    'version', 1, 'kind', 'agent_continue', 'job_id', v_job, 'turn_id', p_turn_id
  )) into v_message;
  insert into vibedigest_private.task_queue_handoffs (
    job_id, job_key, queue_name, message_id, kind, entity_id
  ) values (v_job, 'agent:' || p_turn_id::text, v_turn.continuation_queue,
    v_message, 'agent_continue', p_turn_id);
end;
$$;

create or replace function vibedigest_private.accept_agent_turn(
  p_user_id uuid, p_thread_id uuid, p_message_id text, p_parts jsonb,
  p_title text, p_task_id uuid, p_runtime_config jsonb,
  p_continuation_queue text, p_allowed_video_urls text[]
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_thread public.chat_threads%rowtype;
  v_turn vibedigest_private.agent_turns%rowtype;
  v_handoff vibedigest_private.task_queue_handoffs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('agent-thread:' || p_thread_id::text, 0));
  select * into v_thread from public.chat_threads where id = p_thread_id for update;
  if found and (v_thread.user_id <> p_user_id or v_thread.status = 'deleted') then
    raise exception 'agent_forbidden' using errcode = '42501';
  end if;
  if p_task_id is not null and not exists (
    select 1 from public.tasks where id = p_task_id and (user_id = p_user_id or is_demo)
  ) then raise exception 'agent_forbidden' using errcode = '42501'; end if;
  if not found then
    insert into public.chat_threads(id, user_id, title, task_id)
      values (p_thread_id, p_user_id, left(p_title, 80), p_task_id);
  else
    update public.chat_threads set status = 'active', updated_at = now() where id = p_thread_id;
  end if;
  if exists (select 1 from public.chat_messages where id = p_message_id
    and (thread_id <> p_thread_id or role <> 'user' or content <> p_parts)) then
    raise exception 'agent_input_conflict' using errcode = '22023';
  end if;
  select * into v_turn from vibedigest_private.agent_turns
    where thread_id = p_thread_id and input_message_id = p_message_id for update;
  if found then
    if v_turn.status in ('completed', 'waiting_task', 'finalizing', 'cancelled') then
      return to_jsonb(v_turn) || jsonb_build_object('replayed', true);
    end if;
    if v_turn.status = 'running' and v_turn.lease_until > now() then
      raise exception 'agent_turn_busy' using errcode = '55P03';
    end if;
    if v_turn.status = 'failed' and v_turn.task_id is not null and exists (
      select 1 from vibedigest_private.task_queue_handoffs
      where entity_id = v_turn.id and kind = 'agent_continue'
    ) then
      -- Explicit user retry starts a new delivery generation. Retire the old
      -- delivery atomically so its late failure/ack cannot overwrite the retry.
      for v_handoff in select * from vibedigest_private.task_queue_handoffs
        where entity_id = v_turn.id and kind = 'agent_continue' and status = 'queued'
      loop
        perform pgmq.archive(v_handoff.queue_name, v_handoff.message_id);
        update vibedigest_private.task_queue_handoffs set status = 'failed', completed_at = now()
          where job_id = v_handoff.job_id;
      end loop;
      update vibedigest_private.agent_turns set status = 'waiting_task', error_code = null,
        continuation_attempts = 0, execution_token = gen_random_uuid(), updated_at = now()
        where id = v_turn.id returning * into v_turn;
      perform vibedigest_private.enqueue_agent_continuation(v_turn.id);
      return to_jsonb(v_turn) || jsonb_build_object('replayed', true);
    end if;
    update vibedigest_private.agent_turns set status = 'running', error_code = null,
      execution_token = gen_random_uuid(), lease_until = now() + interval '3 minutes', updated_at = now()
      where id = v_turn.id returning * into v_turn;
    return to_jsonb(v_turn) || jsonb_build_object('replayed', false);
  end if;
  if exists (select 1 from vibedigest_private.agent_turns where thread_id = p_thread_id
    and status = 'running' and lease_until > now()) then
    raise exception 'agent_turn_busy' using errcode = '55P03';
  end if;
  -- A later user message supersedes the pending goal. The new Agent can watch
  -- the same task with the revised goal; it never silently repeats submission.
  update vibedigest_private.agent_turns set status = 'cancelled', updated_at = now(),
    execution_token = gen_random_uuid(), error_code = 'superseded'
    where thread_id = p_thread_id and status in ('running', 'waiting_task', 'finalizing', 'failed');
  insert into public.chat_messages(id, thread_id, role, content)
    values (p_message_id, p_thread_id, 'user', p_parts) on conflict (id) do nothing;
  insert into vibedigest_private.agent_turns (
    thread_id, user_id, input_message_id, task_id, runtime_config,
    continuation_queue, allowed_video_urls
  ) values (
    p_thread_id, p_user_id, p_message_id, coalesce(p_task_id, v_thread.task_id),
    p_runtime_config, p_continuation_queue, coalesce(p_allowed_video_urls, '{}')
  ) returning * into v_turn;
  return to_jsonb(v_turn) || jsonb_build_object('replayed', false);
end;
$$;

create or replace function vibedigest_private.watch_agent_task(
  p_turn_id uuid, p_user_id uuid, p_token uuid, p_task_id uuid, p_locale text
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_turn vibedigest_private.agent_turns%rowtype;
  v_task public.tasks%rowtype;
  v_output public.task_outputs%rowtype;
begin
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id;
  if not found or v_turn.user_id <> p_user_id or v_turn.execution_token <> p_token
    or v_turn.status not in ('running', 'waiting_task') or v_turn.lease_until <= now() then
    raise exception 'agent_stale_turn' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or (v_task.user_id <> p_user_id and not v_task.is_demo) then
    raise exception 'agent_forbidden' using errcode = '42501';
  end if;
  select * into v_output from public.task_outputs where task_id = p_task_id and kind = 'summary'
    order by (locale is not distinct from p_locale) desc, (status = 'completed') desc, created_at desc limit 1 for update;
  -- Lock the watched rows before the turn, so a terminal write cannot pass
  -- between the readiness check and the durable subscription.
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id for update;
  if v_turn.execution_token <> p_token or v_turn.status not in ('running', 'waiting_task') or v_turn.lease_until <= now() then
    raise exception 'agent_stale_turn' using errcode = '42501';
  end if;
  update vibedigest_private.agent_turns set task_id = p_task_id,
    wait_output_id = v_output.id, status = 'waiting_task', updated_at = now()
    where id = p_turn_id returning * into v_turn;
  update public.chat_threads set task_id = p_task_id, updated_at = now() where id = v_turn.thread_id;
  insert into public.chat_messages(id, thread_id, role, content, metadata)
  values ('agent:' || p_turn_id::text || ':reply', v_turn.thread_id, 'assistant',
    jsonb_build_array(jsonb_build_object('type', 'data-task-status', 'data',
      jsonb_build_object('taskId', p_task_id, 'status', case when v_task.status = 'error' then 'failed' else v_task.status end, 'progress', coalesce(v_task.progress, 0)))),
    jsonb_build_object('agentTurnId', p_turn_id, 'agentState', 'waiting_task'))
  on conflict (id) do nothing;
  perform vibedigest_private.enqueue_agent_continuation(p_turn_id);
  return jsonb_build_object('taskId', p_task_id, 'status', v_task.status, 'waiting', true);
end;
$$;

create or replace function vibedigest_private.submit_agent_video_task(
  p_turn_id uuid, p_user_id uuid, p_token uuid,
  p_video_url text, p_output_intent jsonb, p_queue_name text default 'video_processing'
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_turn vibedigest_private.agent_turns%rowtype;
  v_action vibedigest_private.agent_actions%rowtype;
  v_parameters jsonb := jsonb_build_object('url', p_video_url, 'intent', p_output_intent);
  v_submission record;
  v_receipt jsonb;
begin
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id for update;
  if not found or v_turn.user_id <> p_user_id or v_turn.execution_token <> p_token
    or v_turn.status not in ('running', 'waiting_task') or v_turn.lease_until <= now() then
    raise exception 'agent_stale_turn' using errcode = '42501';
  end if;
  select * into v_action from vibedigest_private.agent_actions where turn_id = p_turn_id;
  if found then
    if v_action.parameters <> v_parameters then
      raise exception 'agent_action_conflict' using errcode = '22023';
    end if;
    return v_action.receipt;
  end if;
  if not (p_video_url = any(v_turn.allowed_video_urls)) then
    raise exception 'agent_url_not_in_user_message' using errcode = '42501';
  end if;
  select * into v_submission from vibedigest_private.submit_user_video_task(
    p_user_id, p_video_url, null, 1, p_output_intent, p_queue_name
  );
  if v_submission.task_id is null then
    return jsonb_build_object('error', v_submission.resolution);
  end if;
  -- The registration and terminal check share this transaction. A completion
  -- racing with registration either wakes here or through the terminal trigger.
  v_receipt := vibedigest_private.watch_agent_task(
    p_turn_id, p_user_id, p_token, v_submission.task_id, p_output_intent->>'target_locale'
  ) || jsonb_build_object('resolution', v_submission.resolution);
  insert into vibedigest_private.agent_actions(turn_id, parameters, receipt)
    values (p_turn_id, v_parameters, v_receipt);
  return v_receipt;
end;
$$;

create or replace function vibedigest_private.finish_agent_turn(
  p_turn_id uuid, p_user_id uuid, p_token uuid, p_parts jsonb, p_metadata jsonb,
  p_error_code text default null
)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_turn vibedigest_private.agent_turns%rowtype;
  v_id text;
begin
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id for update;
  if not found or v_turn.user_id <> p_user_id or v_turn.execution_token <> p_token
    or v_turn.status not in ('running', 'waiting_task', 'finalizing')
    or (v_turn.status <> 'waiting_task' and v_turn.lease_until <= now()) then return false; end if;
  if p_error_code is not null then
    -- A stream failure must not discard a committed task handoff.
    if v_turn.status <> 'waiting_task' then
      update vibedigest_private.agent_turns set status = 'failed', error_code = p_error_code,
        updated_at = now() where id = p_turn_id;
      -- A first-token failure still needs a durable, retryable UI state after
      -- reload. This is a final failure notice, never an empty loading message.
      insert into public.chat_messages(id, thread_id, role, content, metadata)
      values ('agent:' || p_turn_id::text || ':reply', v_turn.thread_id, 'assistant',
        jsonb_build_array(jsonb_build_object('type', 'text', 'text',
          case v_turn.runtime_config->>'locale'
            when 'zh' then '回答未能完成，可以重试。'
            when 'ja' then '回答を完了できませんでした。再試行できます。'
            else 'The answer could not finish. You can retry it.' end)),
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('agentTurnId', p_turn_id, 'agentState', 'failed'))
      on conflict (id) do nothing;
    end if;
    return true;
  end if;
  v_id := 'agent:' || p_turn_id::text || case when v_turn.status = 'finalizing'
    then ':completion' else ':reply' end;
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'agent_empty_response' using errcode = '22023';
  end if;
  insert into public.chat_messages(id, thread_id, role, content, metadata)
    values (v_id, v_turn.thread_id, 'assistant', p_parts,
      p_metadata || jsonb_build_object('agentTurnId', p_turn_id, 'agentState',
        case when v_turn.status = 'waiting_task' then 'waiting_task' else 'completed' end))
    on conflict (id) do update set content = excluded.content, metadata = excluded.metadata;
  if v_turn.status <> 'waiting_task' then
    update vibedigest_private.agent_turns set status = 'completed', error_code = null,
      updated_at = now() where id = p_turn_id;
  end if;
  update public.chat_threads set updated_at = now() where id = v_turn.thread_id;
  return true;
end;
$$;

create or replace function vibedigest_private.claim_agent_continuation(
  p_turn_id uuid, p_job_id uuid, p_queue_name text, p_message_id bigint, p_read_count integer
)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_turn vibedigest_private.agent_turns%rowtype;
  v_valid boolean;
begin
  select * into v_turn from vibedigest_private.agent_turns where id = p_turn_id for update;
  if not found then return jsonb_build_object('skip', true); end if;
  if not exists (select 1 from vibedigest_private.task_queue_handoffs
    where job_id = p_job_id and entity_id = p_turn_id and kind = 'agent_continue'
      and queue_name = p_queue_name and message_id = p_message_id and status = 'queued') then
    raise exception 'agent_invalid_delivery' using errcode = '42501';
  end if;
  -- Fence by the actual PGMQ delivery, not a caller-supplied attempt alone.
  execute format('select exists(select 1 from pgmq.%I where msg_id = $1 and read_ct = $2 and vt > now())',
    'q_' || p_queue_name) into v_valid using p_message_id, p_read_count;
  if not v_valid then raise exception 'agent_lease_lost' using errcode = '55P03'; end if;
  if v_turn.status in ('completed', 'cancelled') then return jsonb_build_object('skip', true); end if;
  if v_turn.status = 'finalizing' and v_turn.lease_until > now() then
    return jsonb_build_object('deferSeconds', ceil(extract(epoch from v_turn.lease_until - now())) + 1);
  end if;
  if v_turn.continuation_queue <> p_queue_name or v_turn.status not in ('waiting_task', 'finalizing', 'failed')
    or not vibedigest_private.agent_turn_ready(p_turn_id) then
    raise exception 'agent_not_ready' using errcode = '22023';
  end if;
  update vibedigest_private.agent_turns set status = 'finalizing', error_code = null,
    continuation_attempts = continuation_attempts + 1,
    execution_token = gen_random_uuid(), lease_until = now() + interval '3 minutes', updated_at = now()
    where id = p_turn_id returning * into v_turn;
  return to_jsonb(v_turn);
end;
$$;

create or replace function vibedigest_private.fail_agent_continuation(p_turn_id uuid, p_job_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from vibedigest_private.agent_turns where id = p_turn_id for update;
  if not exists (select 1 from vibedigest_private.task_queue_handoffs
    where job_id = p_job_id and entity_id = p_turn_id and kind = 'agent_continue' and status = 'queued') then return; end if;
  update vibedigest_private.agent_turns set status = 'failed', error_code = 'delivery_failed',
    execution_token = gen_random_uuid(), updated_at = now()
    where id = p_turn_id and status not in ('completed', 'cancelled');
end;
$$;

create or replace function vibedigest_private.wake_agent_turns_on_terminal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_turn_id uuid; v_task_id uuid;
begin
  if new.status not in ('completed', 'error', 'failed') then return new; end if;
  if tg_table_name = 'tasks' then v_task_id := new.id;
  else v_task_id := new.task_id; end if;
  for v_turn_id in select id from vibedigest_private.agent_turns
    where status = 'waiting_task' and task_id = v_task_id
  loop perform vibedigest_private.enqueue_agent_continuation(v_turn_id); end loop;
  return new;
end;
$$;
drop trigger if exists wake_agent_after_task_terminal on public.tasks;
create trigger wake_agent_after_task_terminal after update of status on public.tasks
  for each row execute function vibedigest_private.wake_agent_turns_on_terminal();
drop trigger if exists wake_agent_after_output_terminal on public.task_outputs;
create trigger wake_agent_after_output_terminal after insert or update of status on public.task_outputs
  for each row execute function vibedigest_private.wake_agent_turns_on_terminal();

create or replace function vibedigest_private.project_agent_turn_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_messages set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('agentState', new.status)
    where id = 'agent:' || new.id::text || ':reply';
  return new;
end;
$$;
drop trigger if exists project_agent_turn_state on vibedigest_private.agent_turns;
create trigger project_agent_turn_state after update of status on vibedigest_private.agent_turns
  for each row execute function vibedigest_private.project_agent_turn_state();

-- The delivery is acknowledged only after a confirmed terminal turn write.
create or replace function vibedigest_private.complete_queue_job(
  p_job_id uuid, p_queue_name text, p_message_id bigint, p_status text
)
returns boolean language plpgsql set search_path = '' as $$
declare v_handoff vibedigest_private.task_queue_handoffs%rowtype; v_state text;
begin
  if p_status not in ('completed', 'failed') then raise exception 'Invalid terminal status'; end if;
  select * into v_handoff from vibedigest_private.task_queue_handoffs
    where job_id = p_job_id and queue_name = p_queue_name and message_id = p_message_id and status = 'queued';
  if not found then raise exception 'Queue handoff not found'; end if;
  if v_handoff.kind = 'agent_continue' then
    select status into v_state from vibedigest_private.agent_turns where id = v_handoff.entity_id;
    if found and v_state not in ('completed', 'cancelled', 'failed') then
      raise exception 'Agent turn is not terminal';
    end if;
  end if;
  if not coalesce(pgmq.archive(p_queue_name, p_message_id), false) then return false; end if;
  update vibedigest_private.task_queue_handoffs set status = p_status, completed_at = now() where job_id = p_job_id;
  return true;
end;
$$;

revoke all on all tables in schema vibedigest_private from public, anon, authenticated;
revoke all on all functions in schema vibedigest_private from public, anon, authenticated;
