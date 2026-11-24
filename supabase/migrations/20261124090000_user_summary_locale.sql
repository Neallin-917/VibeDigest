-- Add an output to an owned completed task using the existing output worker.
create or replace function vibedigest_private.request_user_summary_locale(
  p_user_id uuid, p_task_id uuid, p_locale text, p_turn_id uuid, p_token uuid
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_output public.task_outputs%rowtype;
  v_summary jsonb;
  v_status text := 'unavailable';
  v_receipt jsonb := jsonb_build_object('taskId', p_task_id, 'locale', p_locale);
begin
  if p_locale is null or p_locale not in ('en', 'zh') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;
  if (p_turn_id is null) <> (p_token is null) then
    raise exception 'agent_forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('summary-locale:' || p_task_id::text, 0));
  select o.* into v_output from public.task_outputs o
    where o.task_id = p_task_id and o.kind = 'summary'
      and (o.locale = p_locale or (o.locale is null and o.status = 'completed'
        and lower(split_part(replace(vibedigest_private.try_parse_jsonb(o.content)->>'language', '_', '-'), '-', 1)) = p_locale))
    order by (o.status = 'completed') desc, o.updated_at desc limit 1;
  if found then
    perform pg_advisory_xact_lock(hashtextextended('retry:' || v_output.id::text, 0));
  end if;
  select * into v_task from public.tasks where id = p_task_id and user_id = p_user_id
    and guest_id is null and not is_demo and not is_deleted and workload_kind = 'user_submission' for update;
  if not found then
    raise exception 'agent_forbidden' using errcode = '42501';
  end if;
  if p_turn_id is not null then
    perform 1 from vibedigest_private.agent_turns where id = p_turn_id and user_id = p_user_id
      and task_id = p_task_id and status = 'running' and execution_token = p_token
      and lease_until > now() for update;
    if not found then
      raise exception 'agent_forbidden' using errcode = '42501';
    end if;
  elsif v_task.output_intent->>'locale_source' = 'explicit_instruction'
     or v_task.output_intent->>'preferred_summary_locale' in ('en', 'zh') then
    return v_receipt || jsonb_build_object('status', v_status);
  end if;
  if v_task.status <> 'completed' then
    return v_receipt || jsonb_build_object('status', v_status);
  end if;
  -- A normal resubmission of the URL may have added a locale while this
  -- transaction was waiting for the task lock.
  select * into v_output from public.task_outputs where task_id = p_task_id
    and kind = 'summary' and (id = v_output.id or locale = p_locale)
    order by (status = 'completed') desc, updated_at desc limit 1 for update;

  if v_output.status = 'completed' then
    -- Keep legacy content intact, including rows whose stored locale and payload disagree.
    v_summary := vibedigest_private.try_parse_jsonb(v_output.content);
    if (v_summary->>'version') ~ '^([4-9]|[1-9][0-9]+)$'
      and lower(split_part(replace(v_summary->>'language', '_', '-'), '-', 1)) = p_locale
      and nullif(btrim(v_summary->>'overview'), '') is not null
      and jsonb_path_exists(v_summary, '$.keypoints[*] ? (@.title != "" && @.detail != "" && @.evidence != "")') then
      v_status := 'completed';
    end if;
  elsif v_output.status in ('error', 'failed') and p_turn_id is null then
    v_status := 'failed';
  elsif exists (select 1 from public.task_outputs where task_id = p_task_id
    and kind = 'script' and status = 'completed' and nullif(btrim(content), '') is not null
    and btrim(content) <> 'null') then
    if v_output.id is null then
      insert into public.task_outputs (task_id, user_id, kind, locale, status, progress, attempt, intent)
        values (p_task_id, p_user_id, 'summary', p_locale, 'pending', 0, 0,
          coalesce(v_task.output_intent, '{}'::jsonb) || jsonb_build_object(
            'target_locale', p_locale, 'locale_source', case when p_turn_id is null
              then 'ui_locale' else 'explicit_instruction' end, 'reuse_transcript', true))
        returning * into v_output;
    end if;
    perform vibedigest_private.submit_output_retry(v_output.id, p_user_id, null, 'video_processing', 'podcast_supply');
    select status into v_status from public.task_outputs where id = v_output.id;
  end if;

  if v_status = 'error' then
    v_status := 'failed';
  end if;
  if p_turn_id is not null and v_status in ('completed', 'pending', 'processing')
    and v_task.output_intent->>'preferred_summary_locale' is distinct from p_locale then
    update public.tasks set output_intent = coalesce(output_intent, '{}'::jsonb)
      || jsonb_build_object('preferred_summary_locale', p_locale) where id = p_task_id;
  end if;
  return v_receipt || jsonb_build_object('status', v_status);
end;
$$;

revoke all on function vibedigest_private.request_user_summary_locale(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;

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
  -- Submission may resolve to an existing completed task. Keep the new user's
  -- explicit reading choice on that task even when its output already exists.
  if v_submission.resolution = 'reused_completed'
     and p_output_intent->>'locale_source' = 'explicit_instruction'
     and p_output_intent->>'target_locale' in ('en', 'zh') then
    update public.tasks set output_intent = coalesce(output_intent, '{}'::jsonb)
      || jsonb_build_object('preferred_summary_locale', p_output_intent->>'target_locale')
      where id = v_submission.task_id and user_id = p_user_id;
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
