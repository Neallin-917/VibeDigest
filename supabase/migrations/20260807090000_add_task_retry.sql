-- Requeue a terminal task without creating a duplicate task or charging the
-- guest allowance again. State reset and PGMQ delivery remain one transaction.
create or replace function vibedigest_private.retry_video_task(
  p_task_id uuid,
  p_user_id uuid,
  p_guest_id text,
  p_queue_name text default 'video_processing'
)
returns table(message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private
as $$
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
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
    p_queue_name,
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
    p_queue_name,
    v_message_id,
    'process_video',
    p_task_id
  );

  return query select v_message_id;
end;
$$;

revoke all on function vibedigest_private.retry_video_task(
  uuid, uuid, text, text
) from public;
