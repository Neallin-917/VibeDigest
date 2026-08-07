-- Authenticated usage must be consumed in the same transaction that creates
-- the task and its queue handoff. Reuse paths remain free; only a new task
-- consumes included usage or a top-up credit.
--
-- The product promises Basic users three videos per calendar month. Keep the
-- next reset server-side, rather than deriving it from unrelated profile edits.
alter table public.profiles
  add column if not exists usage_reset_at timestamptz not null default (
    (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
  );

create or replace function vibedigest_private.submit_video_task(
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
        jsonb_build_object('source_task_id', v_task.id, 'source_kind', 'script')
      )
      returning * into v_summary;
    else
      update public.task_outputs
         set status = 'pending',
             progress = 0,
             error_message = '',
             intent = v_intent,
             provenance = jsonb_build_object('source_task_id', v_task.id, 'source_kind', 'script'),
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

    -- Access ends on the payment provider's recorded period end. Downgrade
    -- lazily while the row is locked so expired Pro plans cannot create tasks.
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

    -- Basic is a calendar-month allowance. The profile row is locked, so two
    -- simultaneous submissions cannot both reset or consume the same period.
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

  insert into public.tasks (user_id, guest_id, video_url, status, progress, output_intent)
  values (p_user_id, p_guest_id, p_video_url, 'pending', 0, v_intent)
  returning * into v_task;

  insert into public.task_outputs (
    task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
  ) values
    (v_task.id, p_user_id, 'script', null, 'pending', 0, 0, '{}'::jsonb, '{}'::jsonb),
    (
      v_task.id, p_user_id, 'summary', v_target_locale, 'pending', 0, 0, v_intent,
      jsonb_build_object('source_task_id', v_task.id, 'source_kind', 'script')
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

revoke all on function vibedigest_private.submit_video_task(
  uuid, text, text, integer, jsonb, text
) from public;
