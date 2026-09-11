import { describe, expect, it, vi } from "vitest"

import { generateMetadata } from "./layout"
import type { Locale } from "@/lib/i18n"

vi.mock("@/lib/seo", () => ({
  buildAlternateLanguages: () => ({}),
  buildLocalizedPath: (locale: string, path: string) => `https://vibedigest.io/${locale}${path}`,
}))

const expectations: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "Sign in",
    description: "Sign in to continue with VibeDigest.",
  },
  zh: {
    title: "登录",
    description: "登录以继续使用 VibeDigest。",
  },
}

const localeCases = Object.entries(expectations) as [
  Locale,
  (typeof expectations)[Locale],
][]

describe("login metadata", () => {
  it.each(localeCases)("uses %s copy and canonical URL", async (locale, expected) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: locale }) })

    expect(metadata.title).toBe(expected.title)
    expect(metadata.description).toBe(expected.description)
    expect(metadata.alternates?.canonical).toBe(`https://vibedigest.io/${locale}/login`)
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("normalizes an unsupported locale to the English canonical URL", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "ja" }) })

    expect(metadata.title).toBe("Sign in")
    expect(metadata.alternates?.canonical).toBe("https://vibedigest.io/en/login")
  })
})
