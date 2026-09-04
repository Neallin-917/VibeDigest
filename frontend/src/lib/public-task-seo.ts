import type { Metadata } from "next"
import {
  getLocaleDisplayName,
  LOCALE_DATE_TAG,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n"
import { buildAlternateLanguages, buildLocalizedPath, getOpenGraphLocale } from "@/lib/seo"
import { buildTaskPath } from "@/lib/task-path"
import { normalizeSummaryLanguageTag, resolveSummaryLocale } from "@/lib/summary-contract"

export { buildTaskSlug } from "@/lib/task-path"
export { normalizeSummaryLanguageTag, resolveSummaryLocale } from "@/lib/summary-contract"

export type PublicTaskSeoRecord = {
  id: string
  video_title?: string | null
  video_url?: string | null
  thumbnail_url?: string | null
  author?: string | null
  status?: string | null
  is_demo?: boolean | null
  publication_status?: string | null
  published_at?: string | null
  updated_at?: string | null
}

type PublicTaskSeoInput = {
  task: PublicTaskSeoRecord
  locale: Locale
  summary: string
  summaryLanguage?: string | null
  hasCompletedSummary: boolean
  availableLocales?: Locale[]
  canonicalLocale?: Locale
}

const META_COPY: Record<Locale, {
  title: (title: string) => string
  fallbackDescription: (title: string, source: string) => string
  alternativeDescription: (language: string) => string
}> = {
  en: {
    title: (title) => `${title}: Summary & Key Takeaways`,
    fallbackDescription: (title, source) =>
      `Read the summary, key takeaways, and supporting evidence for ${source ? `${source}: ` : ""}${title}.`,
    alternativeDescription: (language) => `This digest is currently available in ${language}.`,
  },
  zh: {
    title: (title) => `《${title}》摘要与关键观点`,
    fallbackDescription: (title, source) =>
      `阅读${source ? `${source}《` : "《"}${title}》的内容摘要、关键观点和支撑证据。`,
    alternativeDescription: (language) => `该整理当前提供${language}版本。`,
  },
}

export function buildPublicTaskPath(task: Pick<PublicTaskSeoRecord, "id" | "video_title">) {
  return buildTaskPath(task)
}

export function isPublishedPublicTask(
  task: PublicTaskSeoRecord,
  hasCompletedSummary: boolean,
) {
  return task.is_demo === true
    && task.status === "completed"
    && task.publication_status === "published"
    && hasCompletedSummary
}

export function resolveSummaryLanguageTag(language: string | null | undefined, fallback: Locale) {
  return normalizeSummaryLanguageTag(language) || LOCALE_DATE_TAG[fallback]
}

export function resolveEvidenceLanguageTag(language?: string | null) {
  const normalized = normalizeSummaryLanguageTag(language)
  return normalized || "und"
}

export function latestValidDate(...values: Array<string | null | undefined>) {
  let latest: Date | null = null

  for (const value of values) {
    if (!value) continue
    const candidate = new Date(value)
    if (Number.isNaN(candidate.getTime())) continue
    if (!latest || candidate.getTime() > latest.getTime()) latest = candidate
  }

  return latest
}

export function buildPublicTaskMetadata({
  task,
  locale,
  summary,
  summaryLanguage,
  hasCompletedSummary,
  availableLocales,
  canonicalLocale,
}: PublicTaskSeoInput): Metadata {
  const title = task.video_title?.trim() || "Processed video"
  const copy = META_COPY[locale]
  const path = buildPublicTaskPath(task)
  const effectiveCanonicalLocale = canonicalLocale ?? locale
  const canonical = buildLocalizedPath(effectiveCanonicalLocale, path)
  const isPublic = isPublishedPublicTask(task, hasCompletedSummary)
  const localizedSummary = resolveSummaryLocale(summaryLanguage) === locale ? summary.trim() : ""
  const alternateLocales = availableLocales ?? [...SUPPORTED_LOCALES]
  const hasAlternativePublicDigest = isPublishedPublicTask(task, true)
    && !isPublic
    && alternateLocales.length > 0
    && canonicalLocale !== undefined
  const description = isPublic
    ? localizedSummary || copy.fallbackDescription(title, task.author?.trim() || "")
    : hasAlternativePublicDigest
      ? copy.alternativeDescription(getLocaleDisplayName(effectiveCanonicalLocale, locale))
      : "This task is not part of the public VibeDigest library."
  const socialTitle = isPublic || hasAlternativePublicDigest ? copy.title(title) : title
  const images: NonNullable<Metadata["openGraph"]>["images"] = task.thumbnail_url && isPublic
    ? [{ url: task.thumbnail_url, alt: title }]
    : [{
        url: "/ai-video-summarizer-transcriber-og.png",
        width: 1200,
        height: 630,
        alt: "VibeDigest",
      }]

  return {
    title: socialTitle,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        Object.entries(buildAlternateLanguages(path))
          .filter(([key]) => key === "x-default" || alternateLocales.includes(key as Locale))
          .map(([key, value]) => key === "x-default"
            ? [key, buildLocalizedPath(alternateLocales[0] ?? effectiveCanonicalLocale, path)]
            : [key, value])
      ),
    },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "VibeDigest",
      locale: getOpenGraphLocale(effectiveCanonicalLocale),
      alternateLocale: alternateLocales
        .filter((candidate) => candidate !== effectiveCanonicalLocale)
        .map(getOpenGraphLocale),
      title: socialTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images,
    },
    robots: isPublic
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true },
  }
}

export function buildPublicTaskJsonLd({
  task,
  locale,
  canonicalUrl,
  description,
  contentLanguage,
  contentModifiedAt,
}: {
  task: PublicTaskSeoRecord
  locale: Locale
  canonicalUrl: string
  description: string
  contentLanguage?: string | null
  contentModifiedAt?: string | null
}) {
  const title = task.video_title?.trim() || "Processed video"
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: resolveSummaryLanguageTag(contentLanguage, locale),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    url: canonicalUrl,
    author: {
      "@type": "Organization",
      name: "VibeDigest",
      url: buildLocalizedPath(locale, ""),
    },
    publisher: {
      "@type": "Organization",
      name: "VibeDigest",
      url: buildLocalizedPath(locale, ""),
    },
  }

  if (task.thumbnail_url) article.image = [task.thumbnail_url]
  const publishedAt = latestValidDate(task.published_at)
  const modifiedAt = latestValidDate(task.updated_at, task.published_at, contentModifiedAt)
  if (publishedAt) article.datePublished = publishedAt.toISOString()
  if (modifiedAt) article.dateModified = modifiedAt.toISOString()
  if (task.video_url) {
    article.isBasedOn = {
      "@type": "CreativeWork",
      name: title,
      url: task.video_url,
    }
  }

  return article
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}
