
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { Suspense } from 'react'
import { LandingNav } from "@/components/landing/LandingNav"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

const SEO_COPY: Record<string, { title: string; description: string }> = {
    en: {
        title: "Explore AI Video Summaries | VibeDigest",
        description:
            "Browse a curated library of AI-generated video summaries. Discover insights from tutorials, news, tech reviews, and more.",
    },
    zh: {
        title: "探索 AI 视频摘要 | VibeDigest",
        description:
            "浏览精选的 AI 视频摘要库，快速获取教程、新闻、评测等内容的核心要点。",
    },
    ja: {
        title: "AI動画要約を探索 | VibeDigest",
        description:
            "厳選されたAI動画要約ライブラリを閲覧。チュートリアル、ニュース、テクレビューなどのインサイトを発見。",
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

export default async function ExplorePage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params
    return (
        <div className="min-h-screen bg-transparent text-slate-800 dark:text-[#F5F5F5] font-sans flex flex-col">
            <LandingNav />

            {/* Background Blobs (Light Mode) */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none dark:hidden -z-10">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            {/* Dark Mode Background */}
            <div className="fixed inset-0 hidden dark:block pointer-events-none -z-10 bg-[#0A0A0A]">
                <div className="absolute inset-0 bg-grid opacity-30" />
            </div>

            <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-24 relative z-10">
                <div className="mb-12 text-center max-w-2xl mx-auto">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-white/70">
                        Explore Community Summaries
                    </h1>
                    <p className="text-base text-slate-600 dark:text-gray-400">
                        Discover what others are watching and summarizing with AI. Browse through thousands of processed videos.
                    </p>

                </div>

                <Suspense fallback={<TemplatesSkeleton />}>
                    <ServerCommunityTemplates limit={100} showHeader={false} />
                </Suspense>
            </main>

            <footer className="py-8 text-center text-slate-500 dark:text-gray-600 text-xs border-t border-slate-200 dark:border-white/5 relative z-10 bg-white/50 dark:bg-[#0A0A0A] backdrop-blur-sm">
                <p>© 2024 VibeDigest. All rights reserved.</p>
                <div className="mt-3 flex justify-center gap-5">
                    <Link href={`/${lang}/privacy`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '隐私政策' : lang === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}</Link>
                    <Link href={`/${lang}/terms`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '服务条款' : lang === 'ja' ? '利用規約' : 'Terms of Service'}</Link>
                </div>
            </footer>
        </div>
    )
}
