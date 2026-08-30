-- Preserve the one safe commercial failure reason in public message metadata so
-- a page reload renders the same pricing recovery path as the live Agent stream.
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
      -- Persist only the allowlisted quota reason. Other operational failures
      -- retain the existing generic, retryable projection after reload.
      insert into public.chat_messages(id, thread_id, role, content, metadata)
      values ('agent:' || p_turn_id::text || ':reply', v_turn.thread_id, 'assistant',
        jsonb_build_array(jsonb_build_object('type', 'text', 'text',
          case when p_error_code = 'quota_exceeded' then
            case v_turn.runtime_config->>'locale'
              when 'zh' then '您的免费额度已用完或点数不足。请升级方案或充值点数以继续使用。'
              when 'ja' then 'プランの上限に達したか、クレジットが不足しています。続けるにはプランをアップグレードするか、クレジットを追加してください。'
              else 'You have reached your plan limit or have insufficient credits. Please upgrade your plan or top up credits to continue.'
            end
          else
            case v_turn.runtime_config->>'locale'
              when 'zh' then '回答未能完成，可以重试。'
              when 'ja' then '回答を完了できませんでした。再試行できます。'
              else 'The answer could not finish. You can retry it.'
            end
          end)),
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('agentTurnId', p_turn_id, 'agentState', 'failed')
          || case when p_error_code = 'quota_exceeded'
            then jsonb_build_object('errorCode', 'quota_exceeded')
            else '{}'::jsonb end)
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
