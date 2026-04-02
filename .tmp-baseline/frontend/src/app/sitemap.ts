import { MetadataRoute } from 'next'
import { supabasePublic } from '@/lib/supabase-public'
import { buildAlternateLanguages, SITE_URL } from '@/lib/seo'
import { SUPPORTED_LOCALES } from '@/lib/i18n'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL
  const supabase = supabasePublic

  const generateSlug = (title: string) => {
    if (!title) return "video"
    return encodeURIComponent(title.trim().replace(/\s+/g, '-'))
  }

  // Static routes
  const staticPaths = [
    '',
    '/privacy',
    '/terms',
    '/explore',
    '/about',
    '/faq',
  ]

  // Dynamic routes from Tasks indicating public content (demos)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at, video_title')
    .eq('status', 'completed')
    .eq('is_demo', true)
    .order('created_at', { ascending: false })
    .limit(1000)

  const sitemapEntries: MetadataRoute.Sitemap = []

  // Generate static entries for each locale
  for (const path of staticPaths) {
    for (const locale of SUPPORTED_LOCALES) {
      const url = `${baseUrl}/${locale}${path}`
      const alternates = { languages: buildAlternateLanguages(path) }

      sitemapEntries.push({
        url,
        lastModified: new Date(),
        changeFrequency: path === '' ? 'daily' : 'weekly',
        priority: path === '' ? 1.0 : 0.8,
        alternates
      })
    }
  }

  // Generate dynamic entries for each task and each locale
  if (tasks) {
    for (const task of tasks) {
      for (const locale of SUPPORTED_LOCALES) {
        const slug = generateSlug(task.video_title || "video")
        const path = `/tasks/${task.id}/${slug}`
        const fullUrl = `${baseUrl}/${locale}${path}`
        
        const languages = Object.fromEntries(
          SUPPORTED_LOCALES.map((l) => [l, `${baseUrl}/${l}${path}`])
        ) as Record<string, string>
        languages["x-default"] = `${baseUrl}/en${path}`

        sitemapEntries.push({
          url: fullUrl,
          lastModified: new Date(task.created_at),
          changeFrequency: 'monthly',
          priority: 0.6,
          alternates: {
              languages
          }
        })
      }
    }
  }

  return sitemapEntries
}
