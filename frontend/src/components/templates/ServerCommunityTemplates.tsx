import { createClient } from "@/lib/supabase/server"
import { shouldUseDemoFixtures } from "@/lib/local-ui-demo"
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { resolveSummaryLocale } from "@/lib/summary-contract"
import { getTopicSourceIds } from "@/lib/topic-hubs"
import {
  CommunityTemplates,
  type CommunityTemplatesIntro,
  type CommunityTemplatesLayout,
  type SourceShelfItem,
  Task,
} from "./CommunityTemplates"
import { getDemoFixtureTasks } from "./demoFixtures"
import type { PodcastSource, PodcastTopic } from "@/lib/podcast-sources"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const PODCAST_TOPICS = new Set<PodcastTopic>([
  "agents",
  "ai-coding",
  "product",
  "startups",
  "research",
])

const PAGE_SIZE = 18
const MAX_PAGE = 20
const DEFAULT_PREVIEW_LIMIT = 4
const PUBLIC_LANGUAGE_FIELD = "public_quality_flags->>language"

const toPodcastSource = (value: unknown): PodcastSource | undefined => {
  if (!isRecord(value)) return undefined
  const slug = typeof value.slug === "string" ? value.slug : ""
  const name = typeof value.name === "string" ? value.name : ""
  const channelUrl = typeof value.source_url === "string" ? value.source_url : ""
  if (!slug || !name || !channelUrl) return undefined
  const aliases = Array.isArray(value.aliases)
    ? value.aliases.filter((alias): alias is string => typeof alias === "string")
    : []
  const topics = Array.isArray(value.topics)
    ? value.topics.filter(
        (topic): topic is PodcastTopic =>
          typeof topic === "string" && PODCAST_TOPICS.has(topic as PodcastTopic)
      )
    : []
  return {
    id: slug,
    name,
    channelUrl,
    avatarUrl: typeof value.avatar_url === "string" ? value.avatar_url : undefined,
    aliases,
    topics,
    featured: value.featured === true,
    order: typeof value.catalog_order === "number" ? value.catalog_order : undefined,
  }
}

const sourceFromTaskRow = (value: Record<string, unknown>) => {
  const episodes = Array.isArray(value.podcast_episodes)
    ? value.podcast_episodes
    : isRecord(value.podcast_episodes)
      ? [value.podcast_episodes]
      : []
  for (const episode of episodes) {
    if (!isRecord(episode)) continue
    const source = toPodcastSource(episode.source)
    if (source) return source
  }
  return undefined
}

const toTask = (value: unknown): Task | null => {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.video_url !== "string" ||
    typeof value.status !== "string" ||
    typeof value.created_at !== "string"
  ) {
    return null
  }

  return {
    id: value.id,
    video_url: value.video_url,
    status: value.status,
    created_at: value.created_at,
    video_title: typeof value.video_title === "string" ? value.video_title : undefined,
    thumbnail_url: typeof value.thumbnail_url === "string" ? value.thumbnail_url : undefined,
    author: typeof value.author === "string" ? value.author : undefined,
    author_image_url: typeof value.author_image_url === "string" ? value.author_image_url : undefined,
    takeaway: typeof value.public_takeaway === "string" ? value.public_takeaway : undefined,
    takeawayLocale: isRecord(value.public_quality_flags)
      ? resolveSummaryLocale(typeof value.public_quality_flags.language === "string" ? value.public_quality_flags.language : null)
      : null,
    keyPointCount: typeof value.public_keypoint_count === "number"
      ? value.public_keypoint_count
      : undefined,
    source: sourceFromTaskRow(value),
  }
}

function normalizeQuery(value: string | undefined) {
  return (value || "").trim().slice(0, 120)
}

function normalizeSource(value: string | undefined) {
  const source = (value || "").trim()
  return source === "all" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source)
    ? source || "all"
    : "all"
}

function normalizePage(value: number | undefined) {
  if (!value || Number.isNaN(value)) return 1
  return Math.max(1, Math.min(value, MAX_PAGE))
}

function applySearchLike<T extends { ilike: (column: string, pattern: string) => T }>(
  query: T,
  search: string,
) {
  const trimmed = normalizeQuery(search)
  if (!trimmed) return query
  const pattern = trimmed.replace(/[%_]+/g, " ").replace(/\s+/g, "%")
  return query.ilike("library_search_text", `%${pattern}%`)
}

function sortSources(items: SourceShelfItem[]) {
  return [...items].sort((left, right) =>
    (left.source.order ?? 1000) - (right.source.order ?? 1000)
    || Number(right.source.featured) - Number(left.source.featured)
    || right.count - left.count
    || left.source.name.localeCompare(right.source.name)
  )
}

function mergeLocalePreferredTasks(
  preferredRows: Array<Record<string, unknown>>,
  fallbackRows: Array<Record<string, unknown>>,
  limit: number,
) {
  const merged: Task[] = []
  const seen = new Set<string>()

  for (const row of [...preferredRows, ...fallbackRows]) {
    const task = toTask(row)
    if (!task || seen.has(task.id)) continue
    seen.add(task.id)
    merged.push(task)
    if (merged.length >= limit) break
  }

  return merged
}

async function fetchSourceShelf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  topic?: PodcastTopic,
): Promise<SourceShelfItem[]> {
  const { data, error } = await supabase
    .from("podcast_library_source_counts")
    .select(`
      slug,
      name,
      source_url,
      avatar_url,
      aliases,
      topics,
      featured,
      catalog_order,
      published_count
    `)
    .limit(200)

  if (error) {
    console.error("Failed to fetch podcast source shelf", {
      code: error.code,
      message: error.message,
    })
    return []
  }

  const sourceItems = (data || []).flatMap((row) => {
    const source = toPodcastSource(row)
    if (!source) return []
    if (topic && !source.topics.includes(topic)) return []
    const count = typeof row.published_count === "number"
      ? row.published_count
      : Number(row.published_count) || 0
    return [{ source, count }]
  })
  return sortSources(sourceItems)
}

export async function ServerCommunityTemplates({
  limit,
  showHeader = true,
  layout = "gallery",
  locale,
  intro,
  initialSource,
  initialQuery,
  page = 1,
  topic,
}: {
  limit?: number
  showHeader?: boolean
  layout?: CommunityTemplatesLayout
  locale: Locale
  intro?: CommunityTemplatesIntro
  initialSource?: string
  initialQuery?: string
  page?: number
  topic?: PodcastTopic
}) {
  const t = createTranslator(locale)
  const copy = {
    loading: t("taskForm.processing"),
    title: t("dashboard.communityExamples"),
    hint: t("dashboard.communityExamplesHint"),
    unavailable: t("landing.communityUnavailable"),
  }

  const normalizedQuery = normalizeQuery(initialQuery)
  const normalizedSource = normalizeSource(initialSource)
  const normalizedPage = normalizePage(page)
  const pageLimit = normalizedPage * PAGE_SIZE
  const previewLimit = Math.max(1, Math.min(limit ?? DEFAULT_PREVIEW_LIMIT, 8))
  const topicSourceIds = topic ? getTopicSourceIds(topic) : []

  if (shouldUseDemoFixtures()) {
    const fixtureLimit = layout === "landingPreview" ? previewLimit : Math.max(pageLimit, 8)
    const fixtureTasks = getDemoFixtureTasks(fixtureLimit).filter(
      (task) => !topic || Boolean(task.source && topicSourceIds.includes(task.source.id)),
    )
    return (
      <CommunityTemplates
        showHeader={showHeader}
        initialTasks={fixtureTasks}
        initialStatus="ready"
        layout={layout}
        locale={locale}
        copy={copy}
        intro={intro}
        initialSource={normalizedSource}
        initialQuery={normalizedQuery}
        sourceItems={sortSources(
          fixtureTasks.reduce<SourceShelfItem[]>((acc, task) => {
            const source = task.source
            if (!source) return acc
            const current = acc.find((item) => item.source.id === source.id)
            if (current) current.count += 1
            else acc.push({ source, count: 1 })
            return acc
          }, [])
        )}
        totalCount={fixtureTasks.length}
        hasMore={false}
        currentPage={normalizedPage}
      />
    )
  }

  const supabase = await createClient()

  const createTasksQuery = (queryLimit: number, preferredLocale?: Locale) => {
    let query = supabase
      .from("tasks")
      .select(`
      id,
      video_url,
      video_title,
      thumbnail_url,
      status,
      created_at,
      author,
      author_image_url,
      public_takeaway,
      public_quality_flags,
      public_keypoint_count,
      public_quality_score,
      library_source_published_at,
      podcast_episodes(
        source:podcast_sources(
          slug,
          name,
          source_url,
          avatar_url,
          aliases,
          topics,
          featured,
          catalog_order
        )
      )
    `)
      .eq("is_demo", true)
      .eq("status", "completed")
      .eq("publication_status", "published")
      .in(PUBLIC_LANGUAGE_FIELD, [...SUPPORTED_LOCALES])
      .order("library_source_published_at", { ascending: false, nullsFirst: false })
      .order("public_quality_score", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false })
      .limit(queryLimit)

    if (preferredLocale) query = query.eq(PUBLIC_LANGUAGE_FIELD, preferredLocale)
    if (topicSourceIds.length > 0) query = query.in("podcast_source_slug", topicSourceIds)
    return query
  }

  if (layout === "landingPreview") {
    const [{ data: preferredData, error: preferredError }, { data, error }] = await Promise.all([
      createTasksQuery(previewLimit, locale),
      createTasksQuery(previewLimit),
    ])

    if (preferredError) {
      console.error("Failed to fetch locale-prioritized public demo tasks", {
        locale,
        code: preferredError.code,
        message: preferredError.message,
      })
    }

    const initialTasks = mergeLocalePreferredTasks(preferredData || [], data || [], previewLimit)

    return (
      <CommunityTemplates
        showHeader={showHeader}
        initialTasks={initialTasks}
        initialStatus={error ? "unavailable" : "ready"}
        layout={layout}
        locale={locale}
        copy={copy}
        intro={intro}
        totalCount={initialTasks.length}
      />
    )
  }

  const activeSource = normalizedSource

  let totalQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true)
    .eq("status", "completed")
    .eq("publication_status", "published")
    .in(PUBLIC_LANGUAGE_FIELD, [...SUPPORTED_LOCALES])

  totalQuery = applySearchLike(totalQuery, normalizedQuery)
  if (topicSourceIds.length > 0) totalQuery = totalQuery.in("podcast_source_slug", topicSourceIds)
  if (activeSource !== "all") totalQuery = totalQuery.eq("podcast_source_slug", activeSource)

  let tasksQuery = createTasksQuery(pageLimit)
  tasksQuery = applySearchLike(tasksQuery, normalizedQuery)
  if (activeSource !== "all") tasksQuery = tasksQuery.eq("podcast_source_slug", activeSource)

  let preferredTasksQuery = createTasksQuery(pageLimit, locale)
  preferredTasksQuery = applySearchLike(preferredTasksQuery, normalizedQuery)
  if (activeSource !== "all") preferredTasksQuery = preferredTasksQuery.eq("podcast_source_slug", activeSource)

  const [
    sourceItems,
    { count: totalCount, error: totalError },
    { data, error },
    { data: preferredData, error: preferredError },
  ] = await Promise.all([
    fetchSourceShelf(supabase, topic),
    totalQuery,
    tasksQuery,
    preferredTasksQuery,
  ])

  if (error || totalError || preferredError) {
    console.error("Failed to fetch public demo tasks", {
      tasksCode: error?.code,
      tasksMessage: error?.message,
      countCode: totalError?.code,
      countMessage: totalError?.message,
      preferredTasksCode: preferredError?.code,
      preferredTasksMessage: preferredError?.message,
    })
  }

  const initialTasks = mergeLocalePreferredTasks(preferredData || [], data || [], pageLimit)
  const readyCount = totalCount ?? initialTasks.length

  return (
    <CommunityTemplates
      showHeader={showHeader}
      initialTasks={initialTasks}
      initialStatus={error || totalError ? "unavailable" : "ready"}
      layout={layout}
      locale={locale}
      copy={copy}
      intro={intro}
      initialSource={activeSource}
      initialQuery={normalizedQuery}
      sourceItems={sourceItems}
      totalCount={readyCount}
      hasMore={normalizedPage < MAX_PAGE && readyCount > pageLimit}
      currentPage={normalizedPage}
    />
  )
}
