import { MetadataRoute } from 'next'
import { supabasePublic } from '@/lib/supabase-public'
import { buildAlternateLanguages, SITE_URL } from '@/lib/seo'
import { SUPPORTED_LOCALES } from '@/lib/i18n'
import { buildPublicTaskPath, latestValidDate } from '@/lib/public-task-seo'

export type PublicSitemapTask = {
  id: string
  video_title: string | null
  created_at: string
  updated_at: string | null
  published_at: string | null
  task_outputs?: Array<{ updated_at: string | null }> | null
}

export const STATIC_SITEMAP_PATHS = [
  '',
  '/privacy',
  '/terms',
  '/explore',
  '/about',
  '/faq',
] as const

export function buildSitemapEntries(tasks: PublicSitemapTask[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const path of STATIC_SITEMAP_PATHS) {
    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        changeFrequency: path === '' ? 'daily' : 'weekly',
        priority: path === '' ? 1 : 0.8,
        alternates: { languages: buildAlternateLanguages(path) },
      })
    }
  }

  for (const task of tasks) {
    const path = buildPublicTaskPath(task)
    const summaryModifiedDates = task.task_outputs?.map((output) => output.updated_at) || []
    const lastModified = latestValidDate(
      task.updated_at,
      task.published_at,
      task.created_at,
      ...summaryModifiedDates,
    )

    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: { languages: buildAlternateLanguages(path) },
      })
    }
  }

  return entries
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: tasks, error } = await supabasePublic
    .from('tasks')
    .select('id, created_at, updated_at, published_at, video_title, task_outputs!inner(updated_at)')
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
