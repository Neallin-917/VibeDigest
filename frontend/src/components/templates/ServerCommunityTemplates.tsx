import { createClient } from "@/lib/supabase/server"
import { shouldUseDemoFixtures } from "@/lib/local-ui-demo"
import type { Locale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { parseCurrentSummary, pickPreferredSummaryOutput, type SummaryOutputCandidate } from "@/lib/summary-contract"
import {
  CommunityTemplates,
  type CommunityTemplatesIntro,
  type CommunityTemplatesLayout,
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

const toTask = (value: unknown, locale: Locale): Task | null => {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.video_url !== "string" ||
    typeof value.status !== "string" ||
    typeof value.created_at !== "string"
  ) {
    return null
  }

  const taskOutputs = Array.isArray(value.task_outputs)
    ? value.task_outputs.filter(isRecord).map((output) => ({
        kind: typeof output.kind === "string" ? output.kind : "",
        content: output.content,
        status: typeof output.status === "string" ? output.status : null,
        locale: typeof output.locale === "string" ? output.locale : null,
        created_at: typeof output.created_at === "string" ? output.created_at : null,
      }))
    : []
  const preferredSummary = pickPreferredSummaryOutput(
    taskOutputs as SummaryOutputCandidate[],
    locale
  )
  const summary = preferredSummary ? parseCurrentSummary(preferredSummary.content) : null

  return {
    id: value.id,
    video_url: value.video_url,
    status: value.status,
    created_at: value.created_at,
    video_title: typeof value.video_title === "string" ? value.video_title : undefined,
    thumbnail_url: typeof value.thumbnail_url === "string" ? value.thumbnail_url : undefined,
    author: typeof value.author === "string" ? value.author : undefined,
    author_image_url: typeof value.author_image_url === "string" ? value.author_image_url : undefined,
    task_outputs: taskOutputs,
    takeaway: summary?.tl_dr || summary?.overview,
    keyPointCount: summary?.keypoints.length,
    source: sourceFromTaskRow(value),
  }
}

export async function ServerCommunityTemplates({
  limit = 8,
  showHeader = true,
  layout = "gallery",
  locale,
  intro,
  initialSource,
  initialQuery,
}: {
  limit?: number
  showHeader?: boolean
  layout?: CommunityTemplatesLayout
  locale: Locale
  intro?: CommunityTemplatesIntro
  initialSource?: string
  initialQuery?: string
}) {
  const t = createTranslator(locale)
  const copy = {
    loading: t("taskForm.processing"),
    title: t("dashboard.communityExamples"),
    hint: t("dashboard.communityExamplesHint"),
    unavailable: t("landing.communityUnavailable"),
  }

  if (shouldUseDemoFixtures()) {
    return (
      <CommunityTemplates
        limit={limit}
        showHeader={showHeader}
        initialTasks={getDemoFixtureTasks(limit)}
        initialStatus="ready"
        layout={layout}
        locale={locale}
        copy={copy}
        intro={intro}
        initialSource={initialSource}
        initialQuery={initialQuery}
      />
    )
  }

  const supabase = await createClient()

  // Artificial delay for testing (Uncomment to test Skeleton)
  // await new Promise(resolve => setTimeout(resolve, 3000))

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      video_url,
      video_title,
      thumbnail_url,
      status,
      created_at,
      author,
      author_image_url,
      publication_status,
      task_outputs!inner(kind, content, status, locale, created_at),
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
    .eq('is_demo', true)
    .eq('status', 'completed')
    .eq('publication_status', 'published')
    .eq('task_outputs.kind', 'summary')
    .eq('task_outputs.status', 'completed')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch public demo tasks", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
  }

  // Transform data to match Task interface
  const initialTasks = (data || [])
    .map((task) => toTask(task, locale))
    .filter((task): task is Task => Boolean(task))

  return (
    <CommunityTemplates
      limit={limit}
      showHeader={showHeader}
      initialTasks={initialTasks}
      initialStatus={error ? "unavailable" : "ready"}
      layout={layout}
      locale={locale}
      copy={copy}
      intro={intro}
      initialSource={initialSource}
      initialQuery={initialQuery}
    />
  )
}
