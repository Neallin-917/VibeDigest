import type { Metadata } from "next"
import Link from "next/link"
import { LandingNav } from "@/components/landing/LandingNav"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { getFullFaqItems } from "@/lib/billing/faq-content"
import { buildFaqPageSchema, serializeJsonLd } from "@/lib/billing/structured-data"

type Props = {
    params: Promise<{
        lang: string
    }>
}

const FAQ_SEO: Record<string, { title: string; description: string; ogDescription: string }> = {
    en: {
        title: "Frequently Asked Questions (FAQ) - VibeDigest AI Video Summarizer",
        description: "Answers to common questions about VibeDigest. Learn how to summarize YouTube videos with AI, pricing details, and supported platforms.",
        ogDescription: "Common questions about VibeDigest features, pricing, and supported platforms.",
    },
    zh: {
        title: "常见问题 (FAQ) - VibeDigest AI 视频摘要助手",
        description: "关于 VibeDigest 的常见问题解答。了解如何使用 AI 快速摘要 YouTube 和 Bilibili 视频，以及我们的定价和功能详情。",
        ogDescription: "了解 VibeDigest 的常见问题与功能支持。",
    },
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    const { lang } = params
    const seo = FAQ_SEO[lang] ?? FAQ_SEO.en
    const path = "/faq"

    return {
        title: seo.title,
        description: seo.description,
        alternates: {
            canonical: buildLocalizedPath(lang, path),
            languages: buildAlternateLanguages(path),
        },
        openGraph: {
            title: "VibeDigest FAQ",
            description: seo.ogDescription,
            url: buildLocalizedPath(lang, path),
        },
        twitter: {
            title: "VibeDigest FAQ",
            description: seo.ogDescription,
        },
    }
}

export default async function FAQPage(props: Props) {
    const params = await props.params;
    const { lang } = params
    const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
    const t = createTranslator(locale)
    const content = getFullFaqItems(t)

    const faqSchema = buildFaqPageSchema(content)

    // BreadcrumbList Structured Data
    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": t("faq.homeBreadcrumb"),
                "item": `https://vibedigest.io/${locale}`
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": t("faq.breadcrumb"),
                "item": `https://vibedigest.io/${locale}/faq`
            }
        ]
    }

    return (
        <div className="min-h-screen bg-transparent text-slate-800 dark:text-[#F5F5F5] font-sans selection:bg-primary/30">
            {/* Background Blobs (Light Mode) */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none dark:hidden -z-10">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            {/* Dark Mode Background */}
            <div className="fixed inset-0 hidden dark:block pointer-events-none -z-10 bg-[#0A0A0A]" />

            <LandingNav />

            <main className="pt-32 pb-20 px-6 relative z-10">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16">
                        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-white/60 mb-6">
                            {t("faq.title")}
                        </h1>
                        <p className="text-base text-slate-600 dark:text-muted-foreground">
                            {t("faq.subtitle")}
                        </p>
                    </div>

                    <div className="space-y-6">
                        {content.map((item, index) => (
                            <div
                                key={index}
                                className="group p-6 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 hover:bg-white/80 dark:hover:bg-white/[0.07] transition-all duration-300 shadow-lg dark:shadow-none"
                            >
                                <h2 className="text-lg font-semibold mb-3 text-slate-800 dark:text-white/90 group-hover:text-indigo-600 dark:group-hover:text-primary transition-colors">
                                    {item.question}
                                </h2>
                                <p className="text-slate-600 dark:text-muted-foreground leading-relaxed text-sm">
                                    {item.answer}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-20 text-center p-8 rounded-2xl bg-gradient-to-b from-indigo-500/10 dark:from-emerald-900/10 to-transparent border border-slate-200 dark:border-white/5">
                        <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
                            {t("faq.moreQuestions")}
                        </h3>
                        <p className="text-slate-600 dark:text-muted-foreground mb-8 text-sm">
                            {t("faq.contactPrompt")}
                        </p>
                        <Link
                            href={`/${locale}/about`}
                            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors mr-4"
                        >
                            {t("faq.about")}
                        </Link>
                        <a
                            href="mailto:support@vibedigest.io"
                            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-indigo-600 dark:bg-white text-white dark:text-black font-medium hover:bg-indigo-700 dark:hover:bg-gray-200 transition-colors"
                        >
                            {t("faq.contactSupport")}
                        </a>
                    </div>
                </div>
            </main>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
            />
        </div>
    )
}
