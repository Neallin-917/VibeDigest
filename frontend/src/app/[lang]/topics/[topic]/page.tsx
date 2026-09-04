import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LandingNav } from "@/components/landing/LandingNav"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { TopicHubLinks } from "@/components/templates/TopicHubLinks"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale } from "@/lib/i18n"
import { TOPIC_ROUTE_ORDER, getTopicHubCopy, isPodcastTopic } from "@/lib/topic-hubs"
import { serializeJsonLd } from "@/lib/public-task-seo"

type Props = {
  params: Promise<{ lang: string; topic: string }>
  searchParams: Promise<{ show?: string | string[]; q?: string | string[]; page?: string | string[] }>
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((lang) =>
    TOPIC_ROUTE_ORDER.map((topic) => ({ lang, topic }))
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, topic } = await params
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  if (!isPodcastTopic(topic)) {
    return { title: "Topic Not Found", robots: { index: false, follow: false } }
  }

  const hub = getTopicHubCopy(locale, topic)
  const path = `/topics/${hub.slug}`

  return {
    title: hub.title,
    description: hub.description,
    alternates: {
      canonical: buildLocalizedPath(locale, path),
      languages: buildAlternateLanguages(path),
    },
    openGraph: {
      type: "website",
      title: hub.title,
      description: hub.description,
      url: buildLocalizedPath(locale, path),
    },
    twitter: {
      title: hub.title,
      description: hub.description,
    },
  }
}

export default async function TopicHubPage({ params, searchParams }: Props) {
  const [{ lang, topic }, queryState] = await Promise.all([params, searchParams])
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  if (!isPodcastTopic(topic)) notFound()

  const hub = getTopicHubCopy(locale, topic)
  const initialSource = typeof queryState.show === "string" ? queryState.show : "all"
  const initialQuery = typeof queryState.q === "string" ? queryState.q.slice(0, 120) : ""
  const initialPage = typeof queryState.page === "string" ? Number.parseInt(queryState.page, 10) : 1
  const canonicalUrl = buildLocalizedPath(locale, `/topics/${hub.slug}`)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: hub.title,
    description: hub.description,
    inLanguage: locale,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "VibeDigest",
      url: buildLocalizedPath(locale, ""),
    },
    about: {
      "@type": "Thing",
      name: hub.shortLabel,
    },
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-slate-800 dark:text-[#F5F5F5]">
      <LandingNav shell="library" />

      <div className="fixed inset-0 -z-10 bg-[color:var(--background)] dark:bg-[#090b0b]">
        <div className="absolute inset-0 hidden bg-grid opacity-30 dark:block" />
      </div>

      <main className="relative z-10 mx-auto min-h-screen w-full max-w-[1440px] px-5 pb-14 pt-24 sm:px-8 md:pt-28 lg:px-14">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
        <TopicHubLinks
          locale={locale}
          title={locale === "zh" ? "继续浏览其他主题" : "Browse more topics"}
          tone="strong"
          className="mb-8"
        />
        <ServerCommunityTemplates
          showHeader={false}
          locale={locale}
          topic={topic}
          intro={{
            eyebrow: hub.eyebrow,
            title: hub.title,
            description: hub.description,
          }}
          initialSource={initialSource}
          initialQuery={initialQuery}
          page={Number.isFinite(initialPage) ? initialPage : 1}
        />
      </main>
    </div>
  )
}
