
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { Suspense } from 'react'
import { LandingNav } from "@/components/landing/LandingNav"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"

const EXPLORE_COPY = {
    en: {
        eyebrow: "VibeDigest Agent output",
        title: "Podcasts, already organized",
        description: "Open a finished digest with the summary, key ideas, transcript, and source-grounded follow-up.",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        copyright: "All rights reserved.",
    },
    zh: {
        eyebrow: "VibeDigest Agent 输出",
        title: "已经整理好的播客",
        description: "直接查看摘要、关键观点和逐字稿，也可以基于原内容继续追问。",
        privacy: "隐私政策",
        terms: "服务条款",
        copyright: "保留所有权利。",
    },
    ja: {
        eyebrow: "VibeDigest Agent の出力",
        title: "整理済みのポッドキャスト",
        description: "要約、重要ポイント、文字起こしを読み、元の内容に基づいて続けて質問できます。",
        privacy: "プライバシーポリシー",
        terms: "利用規約",
        copyright: "All rights reserved.",
    },
} as const

const SEO_COPY: Record<string, { title: string; description: string }> = {
    en: {
        title: "Ready-made Podcast Digests | VibeDigest",
        description:
            "Browse finished podcast digests created by the VibeDigest Agent, including summaries, key ideas, transcripts, and follow-up.",
    },
    zh: {
        title: "播客整理内容库 | VibeDigest",
        description:
            "浏览由 VibeDigest Agent 整理完成的公开播客内容，包括摘要、关键观点、逐字稿和继续追问。",
    },
    ja: {
        title: "整理済みポッドキャスト | VibeDigest",
        description:
            "VibeDigest Agent が整理したポッドキャストの要約、重要ポイント、文字起こしを閲覧できます。",
    },
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: string }>
}): Promise<Metadata> {
    const { lang } = await params
    const meta = SEO_COPY[lang] ?? SEO_COPY.en
    const path = "/explore"

    return {
        title: meta.title,
        description: meta.description,
        alternates: {
            canonical: buildLocalizedPath(lang, path),
            languages: buildAlternateLanguages(path),
        },
        openGraph: {
            title: meta.title,
            description: meta.description,
            url: buildLocalizedPath(lang, path),
        },
        twitter: {
            title: meta.title,
            description: meta.description,
        },
    }
}

export default async function ExplorePage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>
    searchParams: Promise<{ show?: string | string[]; q?: string | string[] }>
}) {
    const [{ lang }, queryState] = await Promise.all([params, searchParams])
    const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
    const copy = EXPLORE_COPY[locale]
    const initialSource = typeof queryState.show === "string" ? queryState.show : "all"
    const initialQuery = typeof queryState.q === "string" ? queryState.q.slice(0, 120) : ""

    return (
        <div className="min-h-screen bg-transparent font-sans text-slate-800 dark:text-[#F5F5F5]">
            <LandingNav />

            <div className="fixed inset-0 -z-10 bg-[color:var(--background)] dark:bg-[#090b0b]">
                <div className="absolute inset-0 hidden bg-grid opacity-30 dark:block" />
            </div>

            <main className="relative z-10 mx-auto min-h-screen w-full max-w-[1440px] px-5 pb-14 pt-24 sm:px-8 md:pt-28 lg:px-14">
                <Suspense fallback={<TemplatesSkeleton />}>
                    <ServerCommunityTemplates
                        limit={100}
                        showHeader={false}
                        locale={locale}
                        intro={copy}
                        initialSource={initialSource}
                        initialQuery={initialQuery}
                    />
                </Suspense>
            </main>

            <footer className="relative z-10 border-t border-slate-200 bg-white/50 py-8 text-center text-xs text-slate-500 backdrop-blur-sm dark:border-white/5 dark:bg-[#090b0b] dark:text-zinc-600">
                <p>© {new Date().getFullYear()} VibeDigest. {copy.copyright}</p>
                <div className="mt-3 flex justify-center gap-5">
                    <Link href={`/${locale}/privacy`} className="inline-flex min-h-11 items-center transition-colors hover:text-slate-900 dark:hover:text-white">{copy.privacy}</Link>
                    <Link href={`/${locale}/terms`} className="inline-flex min-h-11 items-center transition-colors hover:text-slate-900 dark:hover:text-white">{copy.terms}</Link>
                </div>
            </footer>
        </div>
    )
}
