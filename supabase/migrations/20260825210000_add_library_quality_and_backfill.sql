alter table public.tasks
  add column if not exists public_takeaway text,
  add column if not exists public_keypoint_count integer not null default 0
    check (public_keypoint_count >= 0),
  add column if not exists public_quality_score integer not null default 0
    check (public_quality_score between 0 and 100),
  add column if not exists public_quality_flags jsonb not null default '{}'::jsonb,
  add column if not exists public_quality_version integer not null default 1
    check (public_quality_version > 0),
  add column if not exists publication_block_reason text,
  add column if not exists podcast_source_slug text,
  add column if not exists library_source_published_at timestamptz;

alter table public.tasks
  add column if not exists library_search_text text
  generated always as (
    lower(
      coalesce(video_title, '') || ' ' ||
      coalesce(author, '') || ' ' ||
      coalesce(public_takeaway, '') || ' ' ||
      coalesce(podcast_source_slug, '')
    )
  ) stored;

alter table public.podcast_sources
  add column if not exists backfill_enabled boolean not null default false,
  add column if not exists backfill_cursor integer not null default 0
    check (backfill_cursor >= 0),
  add column if not exists backfill_last_checked_at timestamptz,
  add column if not exists backfill_completed_at timestamptz;

create index if not exists idx_tasks_public_library_rank
  on public.tasks (
    library_source_published_at desc,
    public_quality_score desc,
    published_at desc,
    id
  )
  where is_demo = true
    and status = 'completed'
    and publication_status = 'published';

create index if not exists idx_tasks_public_library_source
  on public.tasks (
    podcast_source_slug,
    library_source_published_at desc,
    public_quality_score desc,
    id
  )
  where is_demo = true
    and status = 'completed'
    and publication_status = 'published';

create index if not exists idx_podcast_sources_backfill_pending
  on public.podcast_sources (
    backfill_last_checked_at asc nulls first,
    catalog_order,
    slug
  )
  where active = true
    and backfill_enabled = true
    and backfill_completed_at is null;

create or replace function vibedigest_private.try_parse_jsonb(p_value text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return null;
  end if;
  return p_value::jsonb;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function vibedigest_private.compute_public_task_projection(
  p_task_id uuid,
  p_video_title text,
  p_thumbnail_url text,
  p_author text,
  p_video_url text,
  p_upload_date timestamptz,
  p_is_demo boolean,
  p_workload_kind text
)
returns jsonb
language plpgsql
set search_path = public, vibedigest_private, pg_temp
as $$
declare
  v_summary jsonb;
  v_version integer := 0;
  v_language text := '';
  v_overview text := '';
  v_takeaway text := '';
  v_valid_keypoints integer := 0;
  v_has_transcript boolean := false;
  v_source_slug text;
  v_source_published_at timestamptz;
  v_contract_valid boolean := false;
  v_ready boolean := false;
  v_score integer := 0;
  v_block_reason text;
  v_flags jsonb;
begin
  if not coalesce(p_is_demo, false) then
    return jsonb_build_object(
      'ready', false,
      'takeaway', null,
      'keypoint_count', 0,
      'quality_score', 0,
      'quality_flags', '{}'::jsonb,
      'block_reason', 'private_task',
      'source_slug', null,
      'source_published_at', null
    );
  end if;

  select vibedigest_private.try_parse_jsonb(o.content)
    into v_summary
    from public.task_outputs o
   where o.task_id = p_task_id
     and o.kind = 'summary'
     and o.status = 'completed'
     and nullif(btrim(coalesce(o.content, '')), '') is not null
   order by
     case when lower(coalesce(o.locale, '')) = 'zh' then 0 else 1 end,
     o.created_at desc
   limit 1;

  if jsonb_typeof(v_summary) = 'object' then
    if coalesce(v_summary->>'version', '') ~ '^[0-9]+$' then
      v_version := (v_summary->>'version')::integer;
    end if;
    v_language := btrim(coalesce(v_summary->>'language', ''));
    v_overview := btrim(coalesce(v_summary->>'overview', ''));
    v_takeaway := btrim(
      coalesce(
        nullif(v_summary->>'tl_dr', ''),
        nullif(v_overview, ''),
        ''
      )
    );

    if jsonb_typeof(v_summary->'keypoints') = 'array' then
      select count(*)
        into v_valid_keypoints
        from jsonb_array_elements(v_summary->'keypoints') as item
       where jsonb_typeof(item) = 'object'
         and nullif(btrim(coalesce(item->>'title', '')), '') is not null
         and nullif(btrim(coalesce(item->>'detail', '')), '') is not null
         and nullif(btrim(coalesce(item->>'evidence', '')), '') is not null;
    end if;
  end if;

  v_contract_valid :=
    v_version >= 4
    and v_language <> ''
    and char_length(v_overview) >= 60
    and v_valid_keypoints >= 3;

  select exists (
    select 1
      from public.task_outputs o
     where o.task_id = p_task_id
       and o.kind = 'script'
       and o.status = 'completed'
       and nullif(btrim(coalesce(o.content, '')), '') is not null
  ) into v_has_transcript;

  select s.slug, e.source_published_at
    into v_source_slug, v_source_published_at
    from public.podcast_episodes e
    join public.podcast_sources s on s.id = e.source_id
   where e.task_id = p_task_id
     and s.active = true
   order by e.source_published_at desc nulls last, e.created_at desc
   limit 1;

  if v_source_slug is null and nullif(btrim(coalesce(p_author, '')), '') is not null then
    select s.slug
      into v_source_slug
      from public.podcast_sources s
     where s.active = true
       and (
         lower(btrim(s.name)) = lower(btrim(p_author))
         or exists (
           select 1
             from unnest(s.aliases) as alias(value)
            where char_length(btrim(alias.value)) >= 4
              and lower(btrim(p_author)) like '%' || lower(btrim(alias.value)) || '%'
         )
       )
     order by s.featured desc, s.catalog_order, s.slug
     limit 1;
  end if;

  v_source_published_at := coalesce(
    v_source_published_at,
    p_upload_date
  );

  if v_contract_valid then
    v_score := v_score + 60;
  end if;
  if char_length(v_takeaway) >= 24 then
    v_score := v_score + 8;
  end if;
  if nullif(btrim(coalesce(p_video_title, '')), '') is not null then
    v_score := v_score + 8;
  end if;
  if nullif(btrim(coalesce(p_thumbnail_url, '')), '') is not null then
    v_score := v_score + 8;
  end if;
  if v_has_transcript then
    v_score := v_score + 8;
  end if;
  if v_source_slug is not null then
    v_score := v_score + 6;
  end if;
  if nullif(btrim(coalesce(p_author, '')), '') is not null then
    v_score := v_score + 2;
  end if;
  v_score := least(v_score, 100);

  v_ready :=
    v_contract_valid
    and char_length(v_takeaway) >= 24
    and nullif(btrim(coalesce(p_video_title, '')), '') is not null
    and nullif(btrim(coalesce(p_thumbnail_url, '')), '') is not null
    and v_has_transcript;

  v_block_reason := case
    when v_summary is null then 'summary_missing_or_invalid_json'
    when not v_contract_valid then 'summary_contract_invalid'
    when char_length(v_takeaway) < 24 then 'takeaway_missing'
    when nullif(btrim(coalesce(p_video_title, '')), '') is null then 'title_missing'
    when nullif(btrim(coalesce(p_thumbnail_url, '')), '') is null then 'thumbnail_missing'
    when not v_has_transcript then 'transcript_missing'
    else null
  end;

  v_flags := jsonb_build_object(
    'contract_version', v_version,
    'contract_valid', v_contract_valid,
    'language', nullif(v_language, ''),
    'has_takeaway', char_length(v_takeaway) >= 24,
    'has_title', nullif(btrim(coalesce(p_video_title, '')), '') is not null,
    'has_thumbnail', nullif(btrim(coalesce(p_thumbnail_url, '')), '') is not null,
    'has_transcript', v_has_transcript,
    'has_source', v_source_slug is not null,
    'valid_keypoint_count', v_valid_keypoints
  );

  return jsonb_build_object(
    'ready', v_ready,
    'takeaway', nullif(left(v_takeaway, 600), ''),
    'keypoint_count', v_valid_keypoints,
    'quality_score', v_score,
    'quality_flags', v_flags,
    'block_reason', v_block_reason,
    'source_slug', v_source_slug,
    'source_published_at', v_source_published_at
  );
end;
$$;

-- Rebuild existing projections without letting the old publication trigger
-- reject rows that the stricter gate needs to demote to pending review.
drop trigger if exists sync_task_publication_before_write on public.tasks;

with projections as materialized (
  select
    t.id,
    vibedigest_private.compute_public_task_projection(
      t.id,
      t.video_title,
      t.thumbnail_url,
      t.author,
      t.video_url,
      t.upload_date,
      t.is_demo,
      t.workload_kind
    ) as value
  from public.tasks t
)
update public.tasks t
   set public_takeaway = p.value->>'takeaway',
       public_keypoint_count = coalesce((p.value->>'keypoint_count')::integer, 0),
       public_quality_score = coalesce((p.value->>'quality_score')::integer, 0),
       public_quality_flags = coalesce(p.value->'quality_flags', '{}'::jsonb),
       public_quality_version = 1,
       publication_block_reason = p.value->>'block_reason',
       podcast_source_slug = p.value->>'source_slug',
       library_source_published_at = coalesce(
         (p.value->>'source_published_at')::timestamptz,
         t.upload_date,
         t.published_at,
         t.created_at
       ),
       publication_status = case
         when not t.is_demo then 'private'
         when t.publication_status = 'hidden' then 'hidden'
         when t.status = 'completed'
          and coalesce((p.value->>'ready')::boolean, false)
          and (t.publication_status = 'published' or t.publish_on_complete)
           then 'published'
         when t.status = 'completed' then 'pending_review'
         else 'processing'
       end,
       publish_on_complete = case when t.is_demo then t.publish_on_complete else false end,
       published_at = case
         when t.status = 'completed'
          and coalesce((p.value->>'ready')::boolean, false)
          and (t.publication_status = 'published' or t.publish_on_complete)
           then coalesce(t.published_at, now())
         else null
       end
  from projections p
 where p.id = t.id;

create or replace function public.sync_task_publication()
returns trigger
language plpgsql
set search_path = public, vibedigest_private, pg_temp
as $$
declare
  v_projection jsonb;
  v_ready boolean;
begin
  v_projection := vibedigest_private.compute_public_task_projection(
    new.id,
    new.video_title,
    new.thumbnail_url,
    new.author,
    new.video_url,
    new.upload_date,
    new.is_demo,
    new.workload_kind
  );

  new.public_takeaway = v_projection->>'takeaway';
  new.public_keypoint_count = coalesce((v_projection->>'keypoint_count')::integer, 0);
  new.public_quality_score = coalesce((v_projection->>'quality_score')::integer, 0);
  new.public_quality_flags = coalesce(v_projection->'quality_flags', '{}'::jsonb);
  new.public_quality_version = 1;
  new.publication_block_reason = v_projection->>'block_reason';
  new.podcast_source_slug = v_projection->>'source_slug';
  new.library_source_published_at = coalesce(
    (v_projection->>'source_published_at')::timestamptz,
    new.upload_date,
    new.published_at,
    new.created_at,
    now()
  );
  v_ready := coalesce((v_projection->>'ready')::boolean, false);

  if not new.is_demo then
    new.publication_status = 'private';
    new.publish_on_complete = false;
    new.published_at = null;
    return new;
  end if;

  if new.status = 'completed'
    and new.publication_status in ('processing', 'pending_review') then
    if new.publish_on_complete and v_ready then
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
    elsif new.status <> 'completed' or not v_ready then
      raise exception 'A public task requires a valid v4 summary, transcript, title, and thumbnail';
    else
      new.published_at = coalesce(new.published_at, now());
    end if;
  elsif new.publication_status <> 'published' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create trigger sync_task_publication_before_write
  before insert or update of
    status,
    is_demo,
    publication_status,
    publish_on_complete,
    video_title,
    thumbnail_url,
    author,
    upload_date,
    workload_kind
  on public.tasks
  for each row execute procedure public.sync_task_publication();

create or replace function public.refresh_task_publication_from_output()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_task_id uuid;
  v_kind text;
begin
  if tg_op = 'DELETE' then
    v_task_id := old.task_id;
    v_kind := old.kind;
  else
    v_task_id := new.task_id;
    v_kind := new.kind;
  end if;

  if v_kind in ('summary', 'script') then
    update public.tasks
       set status = status
     where id = v_task_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_task_publication_after_output on public.task_outputs;
create trigger refresh_task_publication_after_output
  after insert or delete or update of task_id, kind, status, content, locale
  on public.task_outputs
  for each row execute procedure public.refresh_task_publication_from_output();

create or replace view public.podcast_library_source_counts
with (security_invoker = true)
as
select
  s.slug,
  s.name,
  s.source_url,
  s.avatar_url,
  s.aliases,
  s.topics,
  s.featured,
  s.catalog_order,
  count(t.id)::bigint as published_count,
  max(t.library_source_published_at) as latest_published_at
from public.podcast_sources s
join public.tasks t on t.podcast_source_slug = s.slug
where s.active = true
  and t.is_demo = true
  and t.status = 'completed'
  and t.publication_status = 'published'
group by
  s.slug,
  s.name,
  s.source_url,
  s.avatar_url,
  s.aliases,
  s.topics,
  s.featured,
  s.catalog_order
having count(t.id) > 0;

revoke all on table public.podcast_library_source_counts from anon, authenticated;
grant select on table public.podcast_library_source_counts to anon, authenticated;

revoke all on function vibedigest_private.try_parse_jsonb(text) from public, anon, authenticated;
revoke all on function vibedigest_private.compute_public_task_projection(
  uuid, text, text, text, text, timestamptz, boolean, text
) from public, anon, authenticated;

revoke all on function public.refresh_task_publication_from_output()
  from public, anon, authenticated;
