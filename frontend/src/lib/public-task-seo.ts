import type { Metadata } from "next"
import { DEFAULT_LOCALE, LOCALE_DATE_TAG, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n"
import { buildAlternateLanguages, buildLocalizedPath, getOpenGraphLocale } from "@/lib/seo"
import { buildTaskPath } from "@/lib/task-path"

export { buildTaskSlug } from "@/lib/task-path"

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
}

const META_COPY: Record<Locale, {
  title: (title: string) => string
  fallbackDescription: (title: string, source: string) => string
}> = {
  en: {
    title: (title) => `${title}: Summary & Key Takeaways`,
    fallbackDescription: (title, source) =>
      `Read the summary, key takeaways, and supporting evidence for ${source ? `${source}: ` : ""}${title}.`,
  },
  zh: {
    title: (title) => `《${title}》摘要与关键观点`,
    fallbackDescription: (title, source) =>
      `阅读${source ? `${source}《` : "《"}${title}》的内容摘要、关键观点和支撑证据。`,
  },
  ja: {
    title: (title) => `「${title}」の要約と重要ポイント`,
    fallbackDescription: (title, source) =>
      `${source ? `${source}「` : "「"}${title}」の要約、重要ポイント、根拠を読む。`,
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

export function resolveSummaryLocale(language?: string | null): Locale | null {
  const normalized = language?.trim().toLowerCase().replace(/_/g, "-") || ""
  if (normalized === "en" || normalized.startsWith("en-") || normalized.startsWith("english")) return "en"
  if (
    normalized === "zh"
    || normalized.startsWith("zh-")
    || normalized.startsWith("chinese")
    || ["中文", "简体中文", "繁體中文"].includes(normalized)
  ) return "zh"
  if (
    ["ja", "jp", "日本語"].includes(normalized)
    || normalized.startsWith("ja-")
    || normalized.startsWith("japanese")
  ) return "ja"
  return null
}

export function resolveSummaryLanguageTag(language: string | null | undefined, fallback: Locale) {
  return LOCALE_DATE_TAG[resolveSummaryLocale(language) || fallback]
}

export function buildPublicTaskMetadata({
  task,
  locale,
  summary,
  summaryLanguage,
  hasCompletedSummary,
}: PublicTaskSeoInput): Metadata {
  const title = task.video_title?.trim() || "Processed video"
  const copy = META_COPY[locale]
  const path = buildPublicTaskPath(task)
  const canonical = buildLocalizedPath(locale, path)
  const isPublic = isPublishedPublicTask(task, hasCompletedSummary)
  const localizedSummary = resolveSummaryLocale(summaryLanguage) === locale ? summary.trim() : ""
  const description = isPublic
    ? localizedSummary || copy.fallbackDescription(title, task.author?.trim() || "")
    : "This task is not part of the public VibeDigest library."
  const socialTitle = isPublic ? copy.title(title) : title
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
      languages: buildAlternateLanguages(path),
    },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "VibeDigest",
      locale: getOpenGraphLocale(locale),
      alternateLocale: SUPPORTED_LOCALES
        .filter((candidate) => candidate !== locale)
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
}: {
  task: PublicTaskSeoRecord
  locale: Locale
  canonicalUrl: string
  description: string
  contentLanguage?: string | null
}) {
  const title = task.video_title?.trim() || "Processed video"
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: resolveSummaryLanguageTag(contentLanguage, locale) || LOCALE_DATE_TAG[DEFAULT_LOCALE],
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
  if (task.published_at) article.datePublished = task.published_at
  if (task.updated_at || task.published_at) article.dateModified = task.updated_at || task.published_at
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
