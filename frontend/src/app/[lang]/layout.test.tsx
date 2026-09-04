import { describe, expect, it, vi } from "vitest"

vi.mock("next/font/google", () => ({
  Syne: () => ({ className: "syne", variable: "--font-syne" }),
  Manrope: () => ({ className: "manrope", variable: "--font-manrope" }),
  Plus_Jakarta_Sans: () => ({ className: "jakarta", variable: "--font-jakarta" }),
}))

vi.mock("@/lib/seo", () => ({
  SITE_URL: "https://vibedigest.io",
  buildLocalizedPath: (locale: string, path: string) => `https://vibedigest.io/${locale}${path}`,
  getOpenGraphLocale: (locale: string) => ({ en: "en_US", zh: "zh_CN", ja: "ja_JP" })[locale] ?? "en_US",
}))

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: undefined,
    NEXT_PUBLIC_BING_SITE_VERIFICATION: undefined,
  },
}))

import RootLayout, { generateMetadata, generateStaticParams } from "./layout"

describe("localized layout metadata", () => {
  it("generates every supported locale as a static route", () => {
    expect(generateStaticParams()).toEqual([
      { lang: "en" },
      { lang: "zh" },
      { lang: "ja" },
    ])
  })

  it.each(["en", "zh", "ja"])("renders %s into the server document", async (locale) => {
    const layout = await RootLayout({
      children: "content",
      auth: "auth",
      params: Promise.resolve({ lang: locale }),
    })

    expect(layout.props.lang).toBe(locale)
  })

  it("generates Chinese title, description, Open Graph and Twitter metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "zh" }) })

    expect(metadata.title).toEqual({
      default: "VibeDigest - 播客与长视频 AI Agent",
      template: "%s | VibeDigest",
    })
    expect(metadata.description).toBe("将播客和长视频整理为摘要、关键观点、证据，以及基于来源的回答。")
    expect(metadata.openGraph).toMatchObject({
      locale: "zh_CN",
      url: "https://vibedigest.io/zh",
      title: "VibeDigest - 将视频与音频整理为结构化知识",
      description: "用结构化摘要、关键观点、证据和基于来源的追问，快速理解长内容。",
    })
    expect(metadata.twitter).toMatchObject({
      title: "VibeDigest - 播客与视频 AI Agent",
      description: "将播客和长视频整理为摘要、关键观点、证据，以及基于来源的回答。",
    })
  })

  it("keeps Japanese metadata available", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "ja" }) })

    expect(metadata.title).toMatchObject({
      default: "VibeDigest - ポッドキャストと長尺動画のAIエージェント",
    })
    expect(metadata.openGraph).toMatchObject({
      locale: "ja_JP",
      url: "https://vibedigest.io/ja",
    })
  })

  it("normalizes unsupported locales to English metadata and canonical URL", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "fr" }) })

    expect(metadata.title).toMatchObject({
      default: "VibeDigest - AI Agent for Podcasts and Long Videos",
    })
    expect(metadata.openGraph).toMatchObject({
      locale: "en_US",
      url: "https://vibedigest.io/en",
    })
  })
})
