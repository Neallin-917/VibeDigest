-- Podcast supply is catalog data, while public visibility remains a task concern.
-- Discovery submits through the canonical task queue; it never runs the pipeline.

alter table public.tasks
  add column if not exists publication_status text not null default 'private'
    check (publication_status in ('private', 'processing', 'pending_review', 'published', 'hidden')),
  add column if not exists publish_on_complete boolean not null default false,
  add column if not exists published_at timestamptz;

update public.tasks t
   set publication_status = case
         when not t.is_demo then 'private'
         when t.status = 'completed'
          and exists (
            select 1
              from public.task_outputs o
             where o.task_id = t.id
               and o.kind = 'summary'
               and o.status = 'completed'
               and nullif(btrim(coalesce(o.content, '')), '') is not null
          ) then 'published'
         else 'processing'
       end,
       published_at = case
         when t.is_demo
          and t.status = 'completed'
          and exists (
            select 1
              from public.task_outputs o
             where o.task_id = t.id
               and o.kind = 'summary'
               and o.status = 'completed'
               and nullif(btrim(coalesce(o.content, '')), '') is not null
          ) then coalesce(t.published_at, t.updated_at, now())
         else null
       end;

create index if not exists idx_tasks_public_library
  on public.tasks (published_at desc, created_at desc)
  where is_demo = true
    and publication_status = 'published'
    and status = 'completed';

create table if not exists public.podcast_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  source_type text not null default 'youtube_channel'
    check (source_type in ('youtube_channel', 'youtube_playlist')),
  source_url text not null unique,
  avatar_url text,
  aliases text[] not null default '{}',
  topics text[] not null default '{}',
  featured boolean not null default false,
  active boolean not null default true,
  discovery_enabled boolean not null default false,
  auto_publish boolean not null default false,
  catalog_order integer not null default 1000,
  min_duration_seconds integer not null default 600
    check (min_duration_seconds >= 0),
  max_new_per_run integer not null default 1
    check (max_new_per_run > 0),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.podcast_sources(id) on delete cascade,
  external_id text not null,
  video_url text not null unique,
  title text not null,
  thumbnail_url text,
  source_published_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  task_id uuid unique references public.tasks(id) on delete set null,
  discovery_status text not null default 'discovered'
    check (discovery_status in ('discovered', 'queued', 'skipped', 'error')),
  last_error text,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists idx_podcast_sources_discovery
  on public.podcast_sources (catalog_order, slug)
  where active = true and discovery_enabled = true;

create index if not exists idx_podcast_episodes_source_id
  on public.podcast_episodes (source_id, source_published_at desc);

create index if not exists idx_podcast_episodes_task_id
  on public.podcast_episodes (task_id)
  where task_id is not null;

create or replace function public.sync_podcast_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_podcast_sources_updated_at on public.podcast_sources;
create trigger update_podcast_sources_updated_at
  before update on public.podcast_sources
  for each row execute procedure public.sync_podcast_updated_at();

drop trigger if exists update_podcast_episodes_updated_at on public.podcast_episodes;
create trigger update_podcast_episodes_updated_at
  before update on public.podcast_episodes
  for each row execute procedure public.sync_podcast_updated_at();

create or replace function public.sync_task_publication()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_has_summary boolean;
begin
  if not new.is_demo then
    new.publication_status = 'private';
    new.publish_on_complete = false;
    new.published_at = null;
    return new;
  end if;

  select exists (
    select 1
      from public.task_outputs o
     where o.task_id = new.id
       and o.kind = 'summary'
       and o.status = 'completed'
       and nullif(btrim(coalesce(o.content, '')), '') is not null
  ) into v_has_summary;

  if new.status = 'completed' and new.publication_status = 'processing' then
    if new.publish_on_complete and v_has_summary then
      new.publication_status = 'published';
      new.published_at = coalesce(new.published_at, now());
    else
      new.publication_status = 'pending_review';
      new.published_at = null;
    end if;
  elsif new.publication_status = 'published' then
    if new.status <> 'completed'
      and tg_op = 'UPDATE'
      and old.publication_status = 'published' then
      new.publication_status = 'processing';
      new.published_at = null;
    elsif new.status <> 'completed' or not v_has_summary then
      raise exception 'A public task requires a completed summary';
    else
      new.published_at = coalesce(new.published_at, now());
    end if;
  elsif new.publication_status <> 'published' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_task_publication_before_write on public.tasks;
create trigger sync_task_publication_before_write
  before insert or update of status, is_demo, publication_status, publish_on_complete
  on public.tasks
  for each row execute procedure public.sync_task_publication();

alter table public.podcast_sources enable row level security;
alter table public.podcast_episodes enable row level security;

drop policy if exists "Public can view active podcast sources" on public.podcast_sources;
create policy "Public can view active podcast sources"
  on public.podcast_sources for select to anon, authenticated
  using (active = true);

drop policy if exists "Public can view published podcast episodes" on public.podcast_episodes;
create policy "Public can view published podcast episodes"
  on public.podcast_episodes for select to anon, authenticated
  using (
    exists (
      select 1
        from public.tasks t
       where t.id = podcast_episodes.task_id
         and t.is_demo = true
         and t.status = 'completed'
         and t.publication_status = 'published'
    )
  );

drop policy if exists "Auth can view own tasks or demo" on public.tasks;
create policy "Auth can view own tasks or demo"
  on public.tasks for all to authenticated
  using (
    (select auth.uid()) = user_id
    or (is_demo = true and publication_status = 'published')
  )
  with check ((select auth.uid()) = user_id);

drop policy if exists "Anon can view demo tasks" on public.tasks;
create policy "Anon can view demo tasks"
  on public.tasks for select to anon
  using (is_demo = true and publication_status = 'published');

drop policy if exists "Auth can view own task outputs or demo" on public.task_outputs;
create policy "Auth can view own task outputs or demo"
  on public.task_outputs for all to authenticated
  using (
    exists (
      select 1
        from public.tasks t
       where t.id = task_outputs.task_id
         and (
           t.user_id = (select auth.uid())
           or (t.is_demo = true and t.publication_status = 'published')
         )
    )
  )
  with check (
    exists (
      select 1
        from public.tasks t
       where t.id = task_outputs.task_id
         and t.user_id = (select auth.uid())
    )
  );

drop policy if exists "Anon can view demo task outputs" on public.task_outputs;
create policy "Anon can view demo task outputs"
  on public.task_outputs for select to anon
  using (
    exists (
      select 1
        from public.tasks t
       where t.id = task_outputs.task_id
         and t.is_demo = true
         and t.publication_status = 'published'
    )
  );

revoke all on table public.podcast_sources from anon, authenticated;
revoke all on table public.podcast_episodes from anon, authenticated;
grant select on table public.podcast_sources to anon, authenticated;
grant select on table public.podcast_episodes to anon, authenticated;

-- Backward-compatible overload: ordinary product submissions still delegate
-- to the existing six-argument canonical function. Internal demo submissions
-- use the same task/output/handoff/PGMQ transaction without consuming quota.
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
declare
  v_task public.tasks%rowtype;
  v_job_id uuid;
  v_message_id bigint;
  v_intent jsonb := coalesce(p_output_intent, '{}'::jsonb);
  v_target_locale text := nullif(btrim(coalesce(p_output_intent->>'target_locale', '')), '');
begin
  if not p_is_demo then
    return query
      select *
        from vibedigest_private.submit_video_task(
          p_user_id,
          p_video_url,
          p_guest_id,
          p_guest_quota_limit,
          p_output_intent,
          p_queue_name
        );
    return;
  end if;

  if p_guest_id is not null then
    raise exception 'Public catalog tasks require an authenticated owner';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('podcast:' || p_user_id::text || ':' || p_video_url, 0)
  );

  select t.*
    into v_task
    from public.tasks t
   where t.user_id = p_user_id
     and t.guest_id is null
     and t.video_url = p_video_url
     and t.is_demo = true
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
   where t.user_id = p_user_id
     and t.guest_id is null
     and t.video_url = p_video_url
     and t.is_demo = true
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
  uuid, text, text, integer, jsonb, text, boolean, boolean
) from public, anon, authenticated;
