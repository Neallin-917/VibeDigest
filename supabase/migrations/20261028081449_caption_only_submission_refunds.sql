-- Record only new submissions. Historical counters do not identify whether
-- monthly allowance or purchased credit was spent, so never guess a refund.
create table vibedigest_private.task_submission_debits (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  user_id uuid not null,
  guest_id text,
  debit_kind text not null check (debit_kind in ('guest', 'monthly', 'extra')),
  usage_reset_at timestamptz,
  tier text,
  period_end timestamptz,
  refunded_at timestamptz
);
revoke all on vibedigest_private.task_submission_debits from public, anon, authenticated;

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
  v_debit_kind text;
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

    v_debit_kind := 'guest';

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

    if v_profile.usage_reset_at <= now() then
      update public.profiles
         set usage_count = 0,
             usage_reset_at = (
               (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
             ),
             updated_at = now()
       where id = p_user_id
       returning * into v_profile;
    end if;

    if v_profile.usage_count < v_profile.usage_limit then
      v_debit_kind := 'monthly';
      update public.profiles
         set usage_count = usage_count + 1,
             updated_at = now()
       where id = p_user_id;
    elsif v_profile.extra_credits > 0 then
      v_debit_kind := 'extra';
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

  insert into vibedigest_private.task_submission_debits (
    task_id, user_id, guest_id, debit_kind, usage_reset_at, tier, period_end
  ) values (
    v_task.id, p_user_id, p_guest_id, v_debit_kind,
    v_profile.usage_reset_at, v_profile.tier, v_profile.period_end
  );

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


-- Caller is the trusted worker. No client-supplied refund amount or owner.
create function vibedigest_private.fail_caption_task(p_task_id uuid, p_error text)
returns boolean language plpgsql
set search_path = public, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_debit vibedigest_private.task_submission_debits%rowtype;
begin
  if p_error not like 'captions_unavailable:%' and p_error not like 'unsupported_source:%' then
    raise exception 'Invalid caption failure';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.status = 'completed' then return false; end if;
  if exists (select 1 from public.task_outputs where task_id = p_task_id
    and kind = 'script' and status = 'completed' and nullif(btrim(content), '') is not null) then
    return false;
  end if;

  select * into v_debit from vibedigest_private.task_submission_debits
    where task_id = p_task_id for update;
  if found and v_debit.refunded_at is null then
    if v_debit.debit_kind = 'guest' then
      update public.guest_usage set usage_count = greatest(usage_count - 1, 0), updated_at = now()
        where guest_id = v_debit.guest_id;
    elsif v_debit.debit_kind = 'extra' then
      update public.profiles set extra_credits = extra_credits + 1, updated_at = now()
        where id = v_debit.user_id;
    else
      -- An old month's allowance must never subtract a new month's usage.
      update public.profiles set usage_count = greatest(usage_count - 1, 0), updated_at = now()
        where id = v_debit.user_id and usage_reset_at is not distinct from v_debit.usage_reset_at
          and tier::text is not distinct from v_debit.tier
          and period_end is not distinct from v_debit.period_end;
    end if;
    update vibedigest_private.task_submission_debits set refunded_at = now()
      where task_id = p_task_id;
  end if;

  update public.task_outputs set status = 'error', error_message = p_error, updated_at = now()
    where task_id = p_task_id and status <> 'completed';
  update public.tasks set status = 'error', error_message = p_error, updated_at = now() where id = p_task_id;
  return true;
end;
$$;
revoke all on function vibedigest_private.fail_caption_task(uuid,text) from public, anon, authenticated;

-- Retrying a refunded task would bypass the existing submission debit. A fresh
-- submission may try again if captions have since become available.
create function vibedigest_private.reject_caption_retry()
returns trigger language plpgsql
set search_path = public, vibedigest_private
as $$
begin
  if old.status = 'error' and new.status in ('pending', 'processing')
    and (old.error_message like 'captions_unavailable:%' or old.error_message like 'unsupported_source:%') then
    raise exception 'This task has no usable captions. Submit a YouTube video with captions instead.';
  end if;
  return new;
end;
$$;
revoke all on function vibedigest_private.reject_caption_retry() from public, anon, authenticated;
create trigger reject_caption_retry before update of status on public.tasks
  for each row execute function vibedigest_private.reject_caption_retry();

create function vibedigest_private.reject_caption_output_retry()
returns trigger language plpgsql
set search_path = public, vibedigest_private
as $$
begin
  if old.status = 'error' and new.status in ('pending', 'processing') and exists (
    select 1 from public.tasks where id = new.task_id and status = 'error'
      and (error_message like 'captions_unavailable:%' or error_message like 'unsupported_source:%')
  ) then
    raise exception 'This task has no usable captions. Submit a YouTube video with captions instead.';
  end if;
  return new;
end;
$$;
revoke all on function vibedigest_private.reject_caption_output_retry() from public, anon, authenticated;
create trigger reject_caption_output_retry before update of status on public.task_outputs
  for each row execute function vibedigest_private.reject_caption_output_retry();
