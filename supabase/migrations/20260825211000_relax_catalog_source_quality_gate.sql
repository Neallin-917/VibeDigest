-- A source relation improves discovery and ranking, but it is not a content
-- quality requirement. Legacy Agent output can remain public while new supply
-- continues to link podcast_episodes to podcast_sources.

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

  if v_projection->>'block_reason' = 'catalog_source_missing' then
    v_projection := v_projection || jsonb_build_object(
      'ready', true,
      'block_reason', null
    );
  end if;

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

update public.tasks
   set publication_status = 'published'
 where is_demo = true
   and status = 'completed'
   and publication_status = 'pending_review'
   and publication_block_reason = 'catalog_source_missing';
