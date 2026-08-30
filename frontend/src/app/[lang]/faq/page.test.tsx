import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import FAQPage from "./page"
import type { Locale } from "@/lib/i18n"

vi.mock("@/components/landing/LandingNav", () => ({
  LandingNav: () => <nav>VibeDigest</nav>,
}))

vi.mock("@/lib/seo", () => ({
  buildAlternateLanguages: () => ({}),
  buildLocalizedPath: (locale: string, path: string) => `https://vibedigest.io/${locale}${path}`,
}))

const expectations: Record<Locale, { title: string; price: string }> = {
  en: { title: "Frequently Asked Questions", price: "Pro costs $9.90 monthly or $99 for 12 months." },
  zh: { title: "常见问题", price: "专业版 月付 $9.90，或按 12 个月收取 $99。" },
  ja: { title: "よくある質問", price: "プロは月額 $9.90、または12か月で $99 です。" },
}
const localeCases = Object.entries(expectations) as [
  Locale,
  { title: string; price: string },
][]

describe("FAQPage", () => {
  it.each(localeCases)(
    "keeps visible %s FAQ copy aligned with its FAQPage schema",
    async (locale, expected) => {
      const { container } = render(
        await FAQPage({ params: Promise.resolve({ lang: locale }) }),
      )

      expect(screen.getByRole("heading", { level: 1, name: expected.title })).toBeInTheDocument()
      expect(screen.getByText((text) => text.startsWith(expected.price))).toBeInTheDocument()

      const schemas = Array.from(
        container.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
      ).map((script) => JSON.parse(script.innerHTML))
      const faqSchema = schemas.find((schema) => schema["@type"] === "FAQPage")

      expect(faqSchema).toBeDefined()
      for (const entry of faqSchema.mainEntity) {
        expect(screen.getByText(entry.name)).toBeInTheDocument()
        expect(screen.getByText(entry.acceptedAnswer.text)).toBeInTheDocument()
      }
    },
  )
})
