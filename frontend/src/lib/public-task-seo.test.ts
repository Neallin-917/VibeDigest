import { describe, expect, it, vi } from "vitest"

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: undefined,
    NEXT_PUBLIC_BASE_URL: undefined,
    FRONTEND_URL: undefined,
  },
}))
import {
  buildPublicTaskJsonLd,
  buildPublicTaskMetadata,
  buildPublicTaskPath,
  isPublishedPublicTask,
  latestValidDate,
  normalizeSummaryLanguageTag,
  resolveEvidenceLanguageTag,
  resolveSummaryLanguageTag,
  serializeJsonLd,
  type PublicTaskSeoRecord,
} from "./public-task-seo"

const publicTask: PublicTaskSeoRecord = {
  id: "task-123",
  video_title: "Agent Systems in Production",
  video_url: "https://www.youtube.com/watch?v=example",
  thumbnail_url: "https://i.ytimg.com/vi/example/maxresdefault.jpg",
  author: "Latent Space",
  status: "completed",
  is_demo: true,
  publication_status: "published",
  published_at: "2026-08-29T10:00:00.000Z",
  updated_at: "2026-08-30T11:00:00.000Z",
}

describe("public task SEO", () => {
  it("builds one stable localized path without query state", () => {
    expect(buildPublicTaskPath(publicTask)).toBe(
      "/tasks/task-123/Agent-Systems-in-Production",
    )
  })

  it("requires the database publication state and a valid completed summary", () => {
    expect(isPublishedPublicTask(publicTask, true)).toBe(true)
    expect(isPublishedPublicTask({ ...publicTask, publication_status: "private" }, true)).toBe(false)
    expect(isPublishedPublicTask(publicTask, false)).toBe(false)
  })

  it.each([
    ["en", "Agent Systems in Production: Summary & Key Takeaways"],
    ["zh", "《Agent Systems in Production》摘要与关键观点"],
    ["ja", "「Agent Systems in Production」の要約と重要ポイント"],
  ] as const)("builds complete %s search and share metadata", (locale, expectedTitle) => {
    const metadata = buildPublicTaskMetadata({
      task: publicTask,
      locale,
      summary: "A source-grounded summary.",
      summaryLanguage: locale,
      hasCompletedSummary: true,
    })

    expect(metadata.title).toBe(expectedTitle)
    expect(metadata.alternates?.canonical).toBe(
      `https://vibedigest.io/${locale}/tasks/task-123/Agent-Systems-in-Production`,
    )
    expect(metadata.alternates?.languages).toMatchObject({
      en: "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
      zh: "https://vibedigest.io/zh/tasks/task-123/Agent-Systems-in-Production",
      ja: "https://vibedigest.io/ja/tasks/task-123/Agent-Systems-in-Production",
      "x-default": "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
    })
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      siteName: "VibeDigest",
      title: expectedTitle,
      description: "A source-grounded summary.",
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: expectedTitle,
      description: "A source-grounded summary.",
    })
    expect(metadata.robots).toMatchObject({ index: true, follow: true })
  })

  it("fails closed for a private or incomplete task", () => {
    const metadata = buildPublicTaskMetadata({
      task: { ...publicTask, publication_status: "private" },
      locale: "en",
      summary: "A private summary must not become a search snippet.",
      hasCompletedSummary: true,
    })

    expect(metadata.description).not.toContain("private summary")
    expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true })
  })

  it("does not use a fallback summary as a snippet for the wrong language route", () => {
    const metadata = buildPublicTaskMetadata({
      task: publicTask,
      locale: "en",
      summary: "这是一段中文摘要。",
      summaryLanguage: "zh-CN",
      hasCompletedSummary: true,
    })

    expect(metadata.description).toBe(
      "Read the summary, key takeaways, and supporting evidence for Latent Space: Agent Systems in Production.",
    )
    expect(metadata.description).not.toContain("中文摘要")
  })

  it("preserves valid non-UI content languages instead of relabeling them as the route locale", () => {
    expect(normalizeSummaryLanguageTag("ko")).toBe("ko")
    expect(normalizeSummaryLanguageTag("es_MX")).toBe("es-MX")
    expect(normalizeSummaryLanguageTag("Korean")).toBe("ko")
    expect(resolveSummaryLanguageTag("ko", "en")).toBe("ko")
    expect(resolveSummaryLanguageTag("not a language", "ja")).toBe("ja-JP")
  })

  it("marks evidence with its source language and leaves missing provenance undetermined", () => {
    expect(resolveEvidenceLanguageTag("English")).toBe("en")
    expect(resolveEvidenceLanguageTag("es_MX")).toBe("es-MX")
    expect(resolveEvidenceLanguageTag("unknown")).toBe("und")
    expect(resolveEvidenceLanguageTag()).toBe("und")
  })

  it("selects the chronologically latest valid public timestamp", () => {
    expect(latestValidDate(
      "2026-08-28T10:00:00.000Z",
      "invalid",
      "2026-08-30T10:00:00.000Z",
    )?.toISOString()).toBe("2026-08-30T10:00:00.000Z")
  })

  it("describes the digest as an Article based on the source, without publishing a transcript or fake media URL", () => {
    const canonicalUrl = "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production"
    const jsonLd = buildPublicTaskJsonLd({
      task: publicTask,
      locale: "en",
      canonicalUrl,
      description: "A source-grounded summary.",
      contentLanguage: "zh-CN",
    })

    expect(jsonLd).toMatchObject({
      "@type": "Article",
      headline: publicTask.video_title,
      inLanguage: "zh-CN",
      datePublished: publicTask.published_at,
      dateModified: publicTask.updated_at,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
      isBasedOn: {
        "@type": "CreativeWork",
        name: publicTask.video_title,
        url: publicTask.video_url,
      },
    })
    expect(JSON.stringify(jsonLd)).not.toContain("transcript")
    expect(JSON.stringify(jsonLd)).not.toContain("contentUrl")
  })

  it("never emits dateModified before a newer publication time", () => {
    const jsonLd = buildPublicTaskJsonLd({
      task: {
        ...publicTask,
        updated_at: "2026-08-28T10:00:00.000Z",
        published_at: "2026-08-30T10:00:00.000Z",
      },
      locale: "en",
      canonicalUrl: "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
      description: "A source-grounded summary.",
      contentLanguage: "ko",
      contentModifiedAt: "2026-08-31T10:00:00.000Z",
    })

    expect(jsonLd).toMatchObject({
      inLanguage: "ko",
      datePublished: "2026-08-30T10:00:00.000Z",
      dateModified: "2026-08-31T10:00:00.000Z",
    })
  })

  it("escapes user-controlled markup before embedding JSON-LD", () => {
    expect(serializeJsonLd({ description: "</script><script>alert(1)</script>" }))
      .toBe('{"description":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}')
  })
})
