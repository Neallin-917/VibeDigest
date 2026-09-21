-- Catalog episodes are one source artifact with two public presentation
-- outputs. Keep both placeholders in the same transaction that creates the
-- task and its PGMQ handoff.

create or replace function vibedigest_private.mark_catalog_bilingual_requirement()
returns trigger
language plpgsql
set search_path = public, vibedigest_private, pg_temp
as $$
begin
  if new.workload_kind = 'catalog_supply' then
    new.output_intent := coalesce(new.output_intent, '{}'::jsonb) || jsonb_build_object(
      'required_locales', jsonb_build_array('en', 'zh')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists aa_mark_catalog_bilingual_requirement_before_insert on public.tasks;
create trigger aa_mark_catalog_bilingual_requirement_before_insert
  before insert on public.tasks
  for each row execute procedure vibedigest_private.mark_catalog_bilingual_requirement();

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
  v_locale text;
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
  ) values (v_task.id, p_user_id, 'script', null, 'pending', 0, 0, '{}'::jsonb, '{}'::jsonb);

  foreach v_locale in array array['en'::text, 'zh'::text]
  loop
    insert into public.task_outputs (
      task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
    ) values (
      v_task.id, p_user_id, 'summary', v_locale, 'pending', 0, 0,
      v_task.output_intent || jsonb_build_object(
        'target_locale', v_locale, 'locale_source', 'catalog_bilingual'
      ),
      jsonb_build_object(
        'source_task_id', v_task.id, 'source_kind', 'script', 'workload_kind', 'catalog_supply'
      )
    );
  end loop;

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

-- One fail-closed gate shared by localized cards, publication, and backfill.
create or replace function vibedigest_private.is_valid_catalog_summary(p_content text, p_locale text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, vibedigest_private, pg_temp
as $$
declare
  v_summary jsonb := vibedigest_private.try_parse_jsonb(p_content);
  v_points integer;
begin
  if jsonb_typeof(v_summary) is distinct from 'object'
    or coalesce(v_summary->>'version', '') !~ '^[0-9]{1,9}$' then
    return false;
  end if;
  if (v_summary->>'version')::integer < 4
    or p_locale is null or p_locale not in ('en', 'zh', 'ja')
    or lower(split_part(replace(coalesce(v_summary->>'language', ''), '_', '-'), '-', 1)) <> p_locale
    or jsonb_typeof(v_summary->'overview') is distinct from 'string'
    or char_length(btrim(coalesce(v_summary->>'overview', ''))) < 60
    or char_length(btrim(coalesce(nullif(v_summary->>'tl_dr', ''), v_summary->>'overview', ''))) < 24
    or jsonb_typeof(v_summary->'keypoints') is distinct from 'array' then
    return false;
  end if;
  select count(*) into v_points
    from jsonb_array_elements(v_summary->'keypoints') item
   where jsonb_typeof(item) = 'object'
     and jsonb_typeof(item->'title') = 'string'
     and jsonb_typeof(item->'detail') = 'string'
     and jsonb_typeof(item->'evidence') = 'string'
     and nullif(btrim(item->>'title'), '') is not null
     and nullif(btrim(item->>'detail'), '') is not null
     and nullif(btrim(item->>'evidence'), '') is not null;
  return v_points >= 3;
end;
$$;

-- Keep card-sized localized takeaways in the existing database-owned public
-- projection. Public list pages still avoid downloading full summary JSON.
create or replace function public.sync_localized_public_summaries()
returns trigger
language plpgsql
set search_path = public, vibedigest_private, pg_temp
as $$
declare
  v_available_languages jsonb := '[]'::jsonb;
  v_takeaways jsonb := '{}'::jsonb;
begin
  if new.is_demo then
    with localized as (
      select distinct on (summary_locale)
        summary_locale,
        left(
          btrim(
            coalesce(
              nullif(summary->>'tl_dr', ''),
              nullif(summary->>'overview', ''),
              ''
            )
          ),
          600
        ) as takeaway
      from public.task_outputs o
      cross join lateral (
        select vibedigest_private.try_parse_jsonb(o.content) as summary
      ) parsed
      cross join lateral (
        select lower(split_part(replace(coalesce(summary->>'language', ''), '_', '-'), '-', 1)) as summary_locale
      ) locale_value
      where o.task_id = new.id
        and o.kind = 'summary'
        and o.status = 'completed'
        and vibedigest_private.is_valid_catalog_summary(o.content, summary_locale)
      order by summary_locale, o.updated_at desc, o.created_at desc
    )
    select
      coalesce(
        jsonb_agg(summary_locale order by case summary_locale when 'en' then 0 when 'zh' then 1 else 2 end),
        '[]'::jsonb
      ),
      coalesce(jsonb_object_agg(summary_locale, takeaway), '{}'::jsonb)
      into v_available_languages, v_takeaways
      from localized
     where takeaway <> '';
  end if;

  new.public_quality_flags := (
    coalesce(new.public_quality_flags, '{}'::jsonb)
      - 'available_languages'
      - 'takeaways'
  ) || jsonb_build_object(
    'available_languages', v_available_languages,
    'takeaways', v_takeaways
  );
  return new;
end;
$$;

drop trigger if exists zz_sync_localized_public_summaries_before_write on public.tasks;
create trigger zz_sync_localized_public_summaries_before_write
  before insert or update on public.tasks
  for each row execute procedure public.sync_localized_public_summaries();

-- Search both localized card projections without fetching full output JSON.
alter table public.tasks
  drop column if exists library_search_text;
alter table public.tasks
  add column library_search_text text
  generated always as (
    lower(
      coalesce(video_title, '') || ' ' ||
      coalesce(author, '') || ' ' ||
      coalesce(public_takeaway, '') || ' ' ||
      coalesce(public_quality_flags #>> '{takeaways,en}', '') || ' ' ||
      coalesce(public_quality_flags #>> '{takeaways,zh}', '') || ' ' ||
      coalesce(podcast_source_slug, '')
    )
  ) stored;

-- The existing publication trigger remains the owner of the general quality
-- projection. This later trigger adds the catalog-only bilingual invariant for
-- tasks created after this migration without demoting legacy rows mid-rollout.
create or replace function public.enforce_catalog_bilingual_publication()
returns trigger
language plpgsql
set search_path = public, vibedigest_private, pg_temp
as $$
declare
  v_valid_locale_count integer := 0;
begin
  if new.workload_kind <> 'catalog_supply'
    or new.publication_status = 'hidden'
    or new.status <> 'completed'
    or coalesce(new.output_intent->'required_locales', '[]'::jsonb)
       <> jsonb_build_array('en', 'zh') then
    return new;
  end if;

  select count(distinct lower(o.locale))
    into v_valid_locale_count
    from public.task_outputs o
    cross join lateral (
      select vibedigest_private.try_parse_jsonb(o.content) as summary
    ) parsed
   where o.task_id = new.id
     and o.kind = 'summary'
     and o.status = 'completed'
     and lower(o.locale) in ('en', 'zh')
     and vibedigest_private.is_valid_catalog_summary(o.content, lower(o.locale));

  if v_valid_locale_count < 2 then
    new.publication_status := 'pending_review';
    new.published_at := null;
    new.publication_block_reason := coalesce(
      new.publication_block_reason,
      'bilingual_summary_missing'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists zy_enforce_catalog_bilingual_publication_before_write on public.tasks;
create trigger zy_enforce_catalog_bilingual_publication_before_write
  before insert or update on public.tasks
  for each row execute procedure public.enforce_catalog_bilingual_publication();

-- Bounded backfill entry point. Each call owns placeholder creation/reset and
-- one ID-only queue handoff in a single transaction.
create or replace function vibedigest_private.enqueue_catalog_summary_locale(
  p_task_id uuid,
  p_locale text
)
returns table(output_id uuid, resolution text, message_id bigint)
language plpgsql
set search_path = public, pgmq, vibedigest_private, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
  v_output public.task_outputs%rowtype;
  v_locale text := lower(split_part(replace(btrim(p_locale), '_', '-'), '-', 1));
  v_message_id bigint;
begin
  if v_locale is null or v_locale not in ('en', 'zh') then
    raise exception 'Catalog summary locale must be en or zh';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('catalog-summary:' || p_task_id::text || ':' || v_locale, 0)
  );

  -- Serialize with the canonical output retry before locking its parent task.
  select o.* into v_output from public.task_outputs o
   where o.task_id = p_task_id and o.kind = 'summary' and o.locale = v_locale;
  if found then
    perform pg_advisory_xact_lock(hashtextextended('retry:' || v_output.id::text, 0));
  end if;

  select t.*
    into v_task
    from public.tasks t
   where t.id = p_task_id
     and t.workload_kind = 'catalog_supply'
     and t.is_demo = true
   for update;

  if not found then
    raise exception 'Catalog task not found';
  end if;

  if v_task.status <> 'completed' or exists (
    select 1 from vibedigest_private.task_queue_handoffs h
     where h.job_key = 'process:' || p_task_id::text and h.status = 'queued'
  ) then
    return query select v_output.id, 'task_active'::text, null::bigint;
    return;
  end if;

  if not exists (
    select 1
      from public.task_outputs o
     where o.task_id = p_task_id
       and o.kind = 'script'
       and o.status = 'completed'
       and nullif(btrim(coalesce(o.content, '')), '') is not null
  ) then
    raise exception 'Catalog task has no completed transcript';
  end if;

  insert into public.task_outputs (
    task_id, user_id, kind, locale, status, progress, attempt, intent, provenance
  ) values (
    v_task.id,
    v_task.user_id,
    'summary',
    v_locale,
    'pending',
    0,
    0,
    coalesce(v_task.output_intent, '{}'::jsonb) || jsonb_build_object(
      'target_locale', v_locale,
      'locale_source', 'catalog_bilingual_backfill'
    ),
    jsonb_build_object(
      'source_task_id', v_task.id,
      'source_kind', 'script',
      'workload_kind', 'catalog_supply'
    )
  )
  on conflict (task_id, kind, locale) do nothing;

  select o.*
    into v_output
    from public.task_outputs o
   where o.task_id = p_task_id
     and o.kind = 'summary'
     and o.locale = v_locale
   for update;

  if v_output.status = 'completed'
    and vibedigest_private.is_valid_catalog_summary(v_output.content, v_locale) then
    return query select v_output.id, 'already_completed'::text, null::bigint;
    return;
  end if;

  select h.message_id
    into v_message_id
    from vibedigest_private.task_queue_handoffs h
   where h.job_key = 'retry:' || v_output.id::text
     and h.status = 'queued'
   limit 1;

  if v_message_id is not null then
    return query select v_output.id, 'already_queued'::text, v_message_id;
    return;
  end if;

  -- An invalid published locale must be demoted before resetting that output.
  -- Keep hidden rows hidden and preserve the existing valid sibling content.
  if v_task.publication_status = 'published'
    and v_output.status = 'completed'
    and not vibedigest_private.is_valid_catalog_summary(v_output.content, v_locale) then
    update public.tasks set publication_status = 'pending_review', publish_on_complete = false
     where id = p_task_id;
  end if;

  update public.task_outputs
     set intent = coalesce(intent, '{}'::jsonb) || jsonb_build_object(
           'target_locale', v_locale, 'locale_source', 'catalog_bilingual_backfill'
         )
   where id = v_output.id;

  select r.message_id into v_message_id
    from vibedigest_private.submit_output_retry(
      v_output.id, v_task.user_id, null, 'video_processing', 'podcast_supply'
    ) r;

  update public.tasks set publish_on_complete = v_task.publish_on_complete
   where id = p_task_id;

  return query select v_output.id, 'queued'::text, v_message_id;
end;
$$;

revoke all on function vibedigest_private.mark_catalog_bilingual_requirement() from public, anon, authenticated;
revoke all on function vibedigest_private.enqueue_catalog_summary_locale(uuid, text) from public, anon, authenticated;

-- Populate localized card projections for existing published catalog rows.
update public.tasks
   set status = status
 where workload_kind = 'catalog_supply'
   and is_demo = true
   and publication_status = 'published';

revoke all on function vibedigest_private.is_valid_catalog_summary(text, text) from public, anon, authenticated;
revoke all on function public.sync_localized_public_summaries() from public, anon, authenticated;
revoke all on function public.enforce_catalog_bilingual_publication() from public, anon, authenticated;
