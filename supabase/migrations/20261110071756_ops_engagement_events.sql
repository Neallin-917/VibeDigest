-- Private, minimal first-party engagement. No page URLs, messages, IPs or emails.
create table vibedigest_private.ops_engagement_config (
 singleton boolean primary key default true check (singleton),
 started_at timestamptz not null
);
-- Set started_at only after the production collector is deployed and verified.
create table vibedigest_private.ops_engagement_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid references public.tasks(id) on delete cascade,
 event_name text not null check (event_name in ('visit','result_view','engaged_read')),
 occurred_at timestamptz not null default now(),
 event_day date generated always as ((occurred_at at time zone 'Asia/Shanghai')::date) stored,
 check ((event_name = 'visit' and task_id is null) or (event_name <> 'visit' and task_id is not null))
);
create unique index ops_engagement_visit_daily on vibedigest_private.ops_engagement_events(user_id,event_day) where event_name='visit';
create unique index ops_engagement_result_once on vibedigest_private.ops_engagement_events(user_id,task_id,event_name) where event_name<>'visit';
create index ops_engagement_time on vibedigest_private.ops_engagement_events(occurred_at);
alter table vibedigest_private.ops_engagement_events enable row level security;
alter table vibedigest_private.ops_engagement_config enable row level security;
revoke all on vibedigest_private.ops_engagement_events, vibedigest_private.ops_engagement_config from public, anon, authenticated;

-- Definer is confined to private schema; public RPC is an invoker wrapper.
create function vibedigest_private.record_ops_engagement(p_event text,p_task_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_event not in ('visit','result_view','engaged_read') or p_event is null then raise exception 'Invalid event'; end if;
 if not exists(select 1 from vibedigest_private.ops_excluded_users) then raise exception 'Exclusions unavailable'; end if;
 if v_user='00000000-0000-0000-0000-000000000001'::uuid or exists(select 1 from vibedigest_private.ops_excluded_users where user_id=v_user) then return; end if;
 if not exists(select 1 from vibedigest_private.ops_engagement_config where singleton and started_at<=now()) then raise exception 'Tracking not enabled'; end if;
 if p_event='visit' and p_task_id is not null then raise exception 'Invalid task'; end if;
 if p_event<>'visit' and not exists(select 1 from public.tasks where id=p_task_id and user_id=v_user and status='completed' and workload_kind='user_submission' and guest_id is null and not is_demo and not is_deleted) then raise exception 'Invalid task'; end if;
 if p_event='engaged_read' and not exists(select 1 from vibedigest_private.ops_engagement_events where user_id=v_user and task_id=p_task_id and event_name='result_view') then raise exception 'View required'; end if;
 insert into vibedigest_private.ops_engagement_events(user_id,task_id,event_name) values(v_user,p_task_id,p_event) on conflict do nothing;
end $$;
revoke all on function vibedigest_private.record_ops_engagement(text,uuid) from public,anon;
grant usage on schema vibedigest_private to authenticated;
grant execute on function vibedigest_private.record_ops_engagement(text,uuid) to authenticated;
create function public.record_ops_engagement(p_event text,p_task_id uuid default null)
returns void language sql security invoker set search_path='' as $$ select vibedigest_private.record_ops_engagement(p_event,p_task_id); $$;
revoke all on function public.record_ops_engagement(text,uuid) from public,anon;
grant execute on function public.record_ops_engagement(text,uuid) to authenticated;
