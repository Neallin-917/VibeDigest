-- Persist business workload identity separately from provider/runtime details.
-- Each canonical submission function creates task state, output placeholders,
-- PGMQ delivery, and handoff audit state in one transaction.

alter table public.tasks
  add column if not exists workload_kind text;

update public.tasks
   set workload_kind = case
     when is_demo = true then 'catalog_supply'
     else 'user_submission'
   end
 where workload_kind is null;

alter table public.tasks
  alter column workload_kind set default 'user_submission',
  alter column workload_kind set not null;

alter table public.tasks
  drop constraint if exists tasks_workload_kind_check;
alter table public.tasks
  add constraint tasks_workload_kind_check
  check (workload_kind in ('user_submission', 'catalog_supply'));

do $$
begin
  if not exists (
    select 1
      from pgmq.list_queues()
     where queue_name = 'podcast_supply'
  ) then
    perform pgmq.create('podcast_supply');
  end if;
end
$$;

create or replace function vibedigest_private.submit_user_video_task(
  p_user_id uuid,
  p_video_url text,
  p_guest_id text,
  p_guest_quota_limit integer,
  p_output_intent jsonb,
  p_queue_name text default 'video_processing'
)
returns table(task_id uuid, resolution text, message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_summary public.task_outputs%rowtype;
  v_profile public.profiles%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_guest_usage_count integer;
  v_intent jsonb := coalesce(p_output_intent, '{}'::jsonb);
  v_target_locale text := nullif(btrim(coalesce(p_output_intent->>'target_locale', '')), '');
begin
  perform pg_advisory_xact_lock(
    hashtextextended('user:' || coalesce(p_guest_id, p_user_id::text) || ':' || p_video_url, 0)
  );

  select t.*
    into v_task
    from public.tasks t
   where t.workload_kind = 'user_submission'
     and (
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
   where t.workload_kind = 'user_submission'
     and (
       (p_guest_id is null and t.user_id = p_user_id and t.guest_id is null)
       or (p_guest_id is not null and t.guest_id = p_guest_id)
     )
     and t.video_url = p_video_url
     and o.kind = 'script'
     and o.status = 'completed'
     and nullif(btrim(cast(o.content as text)), '') is not null
     and btrim(cast(o.content as text)) <> 'null'
   order by t.created_at desc
   limit 1
   for update of t;

  if found then
    select o.*
      into v_summary
      from public.task_outputs o
     where o.task_id = v_task.id
       and o.kind = 'summary'
       and o.locale is not distinct from v_target_locale
     limit 1
     for update;

    if found and v_summary.status = 'completed'
      and nullif(btrim(coalesce(v_summary.content, '')), '') is not null then
      return query select v_task.id, 'reused_completed'::text, null::bigint;
      return;
    end if;

    if not found then
      insert into public.task_outputs (
        task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
      ) values (
        v_task.id, p_user_id, 'summary', v_target_locale, 'pending', 0, 0, v_intent,
        jsonb_build_object(
          'source_task_id', v_task.id,
          'source_kind', 'script',
          'workload_kind', 'user_submission'
        )
      )
      returning * into v_summary;
    else
      update public.task_outputs
         set status = 'pending',
             progress = 0,
             error_message = '',
             intent = v_intent,
             provenance = jsonb_build_object(
               'source_task_id', v_task.id,
               'source_kind', 'script',
               'workload_kind', 'user_submission'
             ),
             updated_at = now()
       where id = v_summary.id
       returning * into v_summary;
    end if;

    select h.message_id
      into v_message_id
      from vibedigest_private.task_queue_handoffs h
     where h.job_key = 'retry:' || v_summary.id::text
       and h.status = 'queued'
     limit 1;

    if v_message_id is null then
      v_job_id := gen_random_uuid();
      select pgmq.send(
        p_queue_name,
        jsonb_build_object(
          'version', 1,
          'kind', 'retry_output',
          'job_id', v_job_id,
          'output_id', v_summary.id
        )
      ) into v_message_id;

      insert into vibedigest_private.task_queue_handoffs (
        job_id, job_key, queue_name, message_id, kind, entity_id
      ) values (
        v_job_id,
        'retry:' || v_summary.id::text,
        p_queue_name,
        v_message_id,
        'retry_output',
        v_summary.id
      );
    end if;

    return query select v_task.id, 'reused_completed'::text, v_message_id;
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
      return query select null::uuid, 'guest_quota_exceeded'::text, null::bigint;
      return;
    end if;
  else
    insert into public.profiles (id)
    values (p_user_id)
    on conflict (id) do nothing;

    select *
      into v_profile
      from public.profiles
     where id = p_user_id
     for update;

    if v_profile.tier = 'pro'
      and v_profile.period_end is not null
      and v_profile.period_end <= now() then
      update public.profiles
         set tier = 'free',
             usage_limit = 3,
             usage_count = 0,
             updated_at = now()
       where id = p_user_id
       returning * into v_profile;
    end if;

    if v_profile.tier = 'free'
      and v_profile.usage_reset_at <= now() then
      update public.profiles
         set usage_count = 0,
             usage_limit = 3,
             usage_reset_at = (
               (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
             ),
             updated_at = now()
       where id = p_user_id
       returning * into v_profile;
    end if;

    if v_profile.usage_count < v_profile.usage_limit then
      update public.profiles
         set usage_count = usage_count + 1,
             updated_at = now()
       where id = p_user_id;
    elsif v_profile.extra_credits > 0 then
      update public.profiles
         set extra_credits = extra_credits - 1,
             updated_at = now()
       where id = p_user_id;
    else
      return query select null::uuid, 'quota_exceeded'::text, null::bigint;
      return;
    end if;
  end if;

  insert into public.tasks (
    user_id, guest_id, video_url, status, progress, output_intent, workload_kind
  ) values (
    p_user_id, p_guest_id, p_video_url, 'pending', 0, v_intent, 'user_submission'
  )
  returning * into v_task;

  insert into public.task_outputs (
    task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
  ) values
    (v_task.id, p_user_id, 'script', null, 'pending', 0, 0, '{}'::jsonb, '{}'::jsonb),
    (
      v_task.id, p_user_id, 'summary', v_target_locale, 'pending', 0, 0, v_intent,
      jsonb_build_object(
        'source_task_id', v_task.id,
        'source_kind', 'script',
        'workload_kind', 'user_submission'
      )
    );

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

create or replace function vibedigest_private.submit_catalog_video_task(
  p_user_id uuid,
  p_video_url text,
  p_output_intent jsonb,
  p_queue_name text default 'podcast_supply',
  p_publish_on_complete boolean default false
)
returns table(task_id uuid, resolution text, message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_intent jsonb := coalesce(p_output_intent, '{}'::jsonb);
  v_target_locale text := nullif(btrim(coalesce(p_output_intent->>'target_locale', '')), '');
begin
  perform pg_advisory_xact_lock(
    hashtextextended('catalog:' || p_user_id::text || ':' || p_video_url, 0)
  );

  select t.*
    into v_task
    from public.tasks t
   where t.workload_kind = 'catalog_supply'
     and t.user_id = p_user_id
     and t.guest_id is null
     and t.video_url = p_video_url
     and t.status in ('pending', 'processing')
   order by t.created_at desc
   limit 1
   for update;

  if found then
    update public.tasks
       set publish_on_complete = p_publish_on_complete,
           publication_status = case
             when publication_status = 'private' then 'processing'
             else publication_status
           end,
           updated_at = now()
     where id = v_task.id;

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
   where t.workload_kind = 'catalog_supply'
     and t.user_id = p_user_id
     and t.guest_id is null
     and t.video_url = p_video_url
     and t.status = 'completed'
     and o.kind = 'summary'
     and o.status = 'completed'
     and nullif(btrim(coalesce(o.content, '')), '') is not null
   order by t.created_at desc
   limit 1
   for update of t;

  if found then
    update public.tasks
       set publish_on_complete = p_publish_on_complete,
           publication_status = case
             when publication_status = 'hidden' then 'hidden'
             when p_publish_on_complete then 'published'
             when publication_status = 'private' then 'pending_review'
             else publication_status
           end,
           updated_at = now()
     where id = v_task.id;
    return query select v_task.id, 'reused_completed'::text, null::bigint;
    return;
  end if;

  insert into public.tasks (
    user_id,
    guest_id,
    video_url,
    status,
    progress,
    output_intent,
    workload_kind,
    is_demo,
    publication_status,
    publish_on_complete
  ) values (
    p_user_id,
    null,
    p_video_url,
    'pending',
    0,
    v_intent,
    'catalog_supply',
    true,
    'processing',
    p_publish_on_complete
  )
  returning * into v_task;

  insert into public.task_outputs (
    task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
  ) values
    (v_task.id, p_user_id, 'script', null, 'pending', 0, 0, '{}'::jsonb, '{}'::jsonb),
    (
      v_task.id, p_user_id, 'summary', v_target_locale, 'pending', 0, 0, v_intent,
      jsonb_build_object(
        'source_task_id', v_task.id,
        'source_kind', 'script',
        'workload_kind', 'catalog_supply'
      )
    );

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

create or replace function vibedigest_private.retry_video_task(
  p_task_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_user_queue_name text default 'video_processing',
  p_catalog_queue_name text default 'podcast_supply'
)
returns table(message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_queue_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('process:' || p_task_id::text, 0));

  select t.*
    into v_task
    from public.tasks t
   where t.id = p_task_id
     and t.user_id = p_user_id
     and (
       (p_guest_id is null and t.guest_id is null)
       or (p_guest_id is not null and t.guest_id = p_guest_id)
     )
   for update;

  if not found then
    raise exception 'Task not found or not owned by caller';
  end if;

  v_queue_name := case v_task.workload_kind
    when 'user_submission' then p_user_queue_name
    when 'catalog_supply' then p_catalog_queue_name
    else null
  end;
  if v_queue_name is null then
    raise exception 'Unsupported task workload: %', v_task.workload_kind;
  end if;

  select h.message_id
    into v_message_id
    from vibedigest_private.task_queue_handoffs h
   where h.job_key = 'process:' || p_task_id::text
     and h.status = 'queued'
   limit 1;

  if v_message_id is not null then
    return query select v_message_id;
    return;
  end if;

  if v_task.status <> 'error' then
    raise exception 'Only terminal tasks can be retried';
  end if;

  update public.tasks
     set status = 'pending',
         progress = 0,
         error_message = '',
         updated_at = now()
   where id = p_task_id;

  update public.task_outputs
     set status = 'pending',
         progress = 0,
         error_message = '',
         updated_at = now()
   where task_id = p_task_id
     and status <> 'completed';

  v_job_id := gen_random_uuid();
  select pgmq.send(
    v_queue_name,
    jsonb_build_object(
      'version', 1,
      'kind', 'process_video',
      'job_id', v_job_id,
      'task_id', p_task_id
    )
  ) into v_message_id;

  insert into vibedigest_private.task_queue_handoffs (
    job_id, job_key, queue_name, message_id, kind, entity_id
  ) values (
    v_job_id,
    'process:' || p_task_id::text,
    v_queue_name,
    v_message_id,
    'process_video',
    p_task_id
  );

  return query select v_message_id;
end;
$$;

create or replace function vibedigest_private.submit_output_retry(
  p_output_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_user_queue_name text default 'video_processing',
  p_catalog_queue_name text default 'podcast_supply'
)
returns table(message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_queue_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('retry:' || p_output_id::text, 0));

  select t.*
    into v_task
    from public.task_outputs o
    join public.tasks t on t.id = o.task_id
   where o.id = p_output_id
     and o.user_id = p_user_id
     and (
       (p_guest_id is null and t.guest_id is null)
       or (p_guest_id is not null and t.guest_id = p_guest_id)
     )
   for update of o, t;

  if not found then
    raise exception 'Output not found or not owned by caller';
  end if;

  v_queue_name := case v_task.workload_kind
    when 'user_submission' then p_user_queue_name
    when 'catalog_supply' then p_catalog_queue_name
    else null
  end;
  if v_queue_name is null then
    raise exception 'Unsupported task workload: %', v_task.workload_kind;
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
    v_queue_name,
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
    v_queue_name,
    v_message_id,
    'retry_output',
    p_output_id
  );

  return query select v_message_id;
end;
$$;

-- Rolling-deploy compatibility. Older API/cron images may still call the
-- previous function names, but they cannot choose a queue that violates the
-- persisted workload policy.
create or replace function vibedigest_private.submit_video_task(
  p_user_id uuid,
  p_video_url text,
  p_guest_id text,
  p_guest_quota_limit integer,
  p_output_intent jsonb,
  p_queue_name text default 'video_processing'
)
returns table(task_id uuid, resolution text, message_id bigint)
language sql
set search_path = public, pgmq, vibedigest_private
as $$
  select *
    from vibedigest_private.submit_user_video_task(
      p_user_id,
      p_video_url,
      p_guest_id,
      p_guest_quota_limit,
      p_output_intent,
      p_queue_name
    )
$$;

create or replace function vibedigest_private.submit_video_task(
  p_user_id uuid,
  p_video_url text,
  p_guest_id text,
  p_guest_quota_limit integer,
  p_output_intent jsonb,
  p_queue_name text,
  p_is_demo boolean,
  p_publish_on_complete boolean
)
returns table(task_id uuid, resolution text, message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
begin
  if p_is_demo then
    if p_guest_id is not null then
      raise exception 'Public catalog tasks require an authenticated owner';
    end if;
    return query
      select *
        from vibedigest_private.submit_catalog_video_task(
          p_user_id,
          p_video_url,
          p_output_intent,
          'podcast_supply',
          p_publish_on_complete
        );
    return;
  end if;

  return query
    select *
      from vibedigest_private.submit_user_video_task(
        p_user_id,
        p_video_url,
        p_guest_id,
        p_guest_quota_limit,
        p_output_intent,
        p_queue_name
      );
end;
$$;

create or replace function vibedigest_private.retry_video_task(
  p_task_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_queue_name text default 'video_processing'
)
returns table(message_id bigint)
language sql
set search_path = public, pgmq, vibedigest_private
as $$
  select *
    from vibedigest_private.retry_video_task(
      p_task_id,
      p_user_id,
      p_guest_id,
      p_queue_name,
      'podcast_supply'
    )
$$;

create or replace function vibedigest_private.submit_output_retry(
  p_output_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_queue_name text default 'video_processing'
)
returns table(message_id bigint)
language sql
set search_path = public, pgmq, vibedigest_private
as $$
  select *
    from vibedigest_private.submit_output_retry(
      p_output_id,
      p_user_id,
      p_guest_id,
      p_queue_name,
      'podcast_supply'
    )
$$;

revoke all on function vibedigest_private.submit_user_video_task(
  uuid, text, text, integer, jsonb, text
) from public, anon, authenticated;
revoke all on function vibedigest_private.submit_catalog_video_task(
  uuid, text, jsonb, text, boolean
) from public, anon, authenticated;
revoke all on function vibedigest_private.retry_video_task(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function vibedigest_private.submit_output_retry(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function vibedigest_private.submit_video_task(
  uuid, text, text, integer, jsonb, text
) from public, anon, authenticated;
revoke all on function vibedigest_private.submit_video_task(
  uuid, text, text, integer, jsonb, text, boolean, boolean
) from public, anon, authenticated;
revoke all on function vibedigest_private.retry_video_task(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function vibedigest_private.submit_output_retry(
  uuid, uuid, text, text
) from public, anon, authenticated;
