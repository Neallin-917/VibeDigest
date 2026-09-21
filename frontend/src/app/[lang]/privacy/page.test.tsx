import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import PrivacyPage, { generateMetadata } from "./page"
import type { Locale } from "@/lib/i18n"

vi.mock("@/components/landing/LandingNav", () => ({
    LandingNav: () => <nav>VibeDigest</nav>,
}))

vi.mock("@/lib/seo", () => ({
    buildAlternateLanguages: () => ({}),
    buildLocalizedPath: (locale: string, path: string) => `https://vibedigest.io/${locale}${path}`,
}))

const expectations: Record<Locale, {
    title: string
    collection: string
    updatedAt: string
    metadataDescription: string
}> = {
    en: {
        title: "Privacy Policy",
        collection: "1. Information We Collect",
        updatedAt: "Last Updated: December 2024",
        metadataDescription: "Learn how VibeDigest collects, uses, and protects your personal information.",
    },
    zh: {
        title: "隐私政策",
        collection: "1. 我们收集的信息",
        updatedAt: "最后更新于：2024年12月",
        metadataDescription: "了解 VibeDigest 如何收集、使用和保护您的个人信息。",
    },
}

const localeCases = Object.entries(expectations) as [
    Locale,
    (typeof expectations)[Locale],
][]

describe("PrivacyPage", () => {
    it.each(localeCases)("renders complete %s content", async (locale, expected) => {
        render(await PrivacyPage({ params: Promise.resolve({ lang: locale }) }))

        expect(screen.getByRole("heading", { level: 1, name: expected.title })).toBeInTheDocument()
        expect(screen.getByRole("heading", { level: 2, name: expected.collection })).toBeInTheDocument()
        expect(screen.getByText(expected.updatedAt)).toBeInTheDocument()
    })

    it.each(localeCases)("generates %s metadata", async (locale, expected) => {
        const metadata = await generateMetadata({ params: Promise.resolve({ lang: locale }) })

        expect(metadata.title).toBe(expected.title)
        expect(metadata.description).toBe(expected.metadataDescription)
        expect(metadata.alternates?.canonical).toBe(`https://vibedigest.io/${locale}/privacy`)
    })
})
