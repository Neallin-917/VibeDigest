import { MetadataRoute } from 'next'
import { supabasePublic } from '@/lib/supabase-public'
import { buildAlternateLanguages, SITE_URL } from '@/lib/seo'
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n'
import { buildPublicTaskPath, latestValidDate } from '@/lib/public-task-seo'
import { listPublicSummaryLocales } from '@/lib/summary-contract'
import { TOPIC_ROUTE_ORDER } from '@/lib/topic-hubs'

export type PublicSitemapTask = {
  id: string
  video_title: string | null
  created_at: string
  updated_at: string | null
  published_at: string | null
  public_quality_flags?: { language?: string | null } | null
  task_outputs?: Array<{
    kind?: string | null
    status?: string | null
    updated_at: string | null
    locale?: string | null
  }> | null
}

export const STATIC_SITEMAP_PATHS = [
  '',
  '/privacy',
  '/terms',
  '/explore',
  '/about',
  '/faq',
] as const

export const TOPIC_SITEMAP_PATHS = TOPIC_ROUTE_ORDER.map((topic) => `/topics/${topic}`) as string[]

export function buildSitemapEntries(tasks: PublicSitemapTask[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const path of [...STATIC_SITEMAP_PATHS, ...TOPIC_SITEMAP_PATHS]) {
    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: path === '' ? 'daily' : path.startsWith('/topics/') ? 'weekly' : 'weekly',
        priority: path === '' ? 1 : path.startsWith('/topics/') ? 0.7 : 0.8,
        alternates: { languages: buildAlternateLanguages(path) },
      })
    }
  }

  for (const task of tasks) {
    const path = buildPublicTaskPath(task)
    const completedSummaryOutputs = task.task_outputs?.filter(
      (output) => output.kind === 'summary' && output.status === 'completed'
    ) || []
    const summaryModifiedDates = completedSummaryOutputs.map((output) => output.updated_at)
    const locales = listPublicSummaryLocales(
      completedSummaryOutputs,
      task.public_quality_flags?.language
    )
    const lastModified = latestValidDate(
      task.updated_at,
      task.published_at,
      task.created_at,
      ...summaryModifiedDates,
    )

    for (const locale of locales) {
      const alternates = Object.fromEntries(
        Object.entries(buildAlternateLanguages(path))
          .filter(([key]) => key === 'x-default' || locales.includes(key as Locale))
          .map(([key, value]) => key === 'x-default'
            ? [key, `${SITE_URL}/${locales[0] ?? locale}${path}`]
            : [key, value])
      )
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: { languages: alternates },
      })
    }
  }

  return entries
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: tasks, error } = await supabasePublic
    .from('tasks')
    .select('id, created_at, updated_at, published_at, video_title, public_quality_flags, task_outputs!inner(kind, status, updated_at, locale)')
    .eq('status', 'completed')
    .eq('is_demo', true)
    .eq('publication_status', 'published')
    .eq('task_outputs.kind', 'summary')
    .eq('task_outputs.status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    throw new Error('Failed to load public sitemap tasks', { cause: error })
  }

  return buildSitemapEntries((tasks || []) as PublicSitemapTask[])
}
