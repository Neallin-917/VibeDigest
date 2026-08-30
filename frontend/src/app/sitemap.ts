import { MetadataRoute } from 'next'
import { supabasePublic } from '@/lib/supabase-public'
import { buildAlternateLanguages, SITE_URL } from '@/lib/seo'
import { SUPPORTED_LOCALES } from '@/lib/i18n'
import { buildPublicTaskPath } from '@/lib/public-task-seo'

export type PublicSitemapTask = {
  id: string
  video_title: string | null
  created_at: string
  updated_at: string | null
  published_at: string | null
}

export const STATIC_SITEMAP_PATHS = [
  '',
  '/privacy',
  '/terms',
  '/explore',
  '/about',
  '/faq',
] as const

function validDate(value: string | null | undefined) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

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
    const lastModified = validDate(task.updated_at) || validDate(task.published_at) || validDate(task.created_at)

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
  const { data: tasks } = await supabasePublic
    .from('tasks')
    .select('id, created_at, updated_at, published_at, video_title, task_outputs!inner(id)')
    .eq('status', 'completed')
    .eq('is_demo', true)
    .eq('publication_status', 'published')
    .eq('task_outputs.kind', 'summary')
    .eq('task_outputs.status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1000)

  return buildSitemapEntries((tasks || []) as PublicSitemapTask[])
}
