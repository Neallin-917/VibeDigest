import type { Metadata } from "next"
import Link from "next/link"
import { LandingNav } from "@/components/landing/LandingNav"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

type Props = {
    params: Promise<{
        lang: string
    }>
}

const FAQS: Record<string, { question: string; answer: string }[]> = {
    en: [
        {
            question: "What is VibeDigest?",
            answer: "VibeDigest is an AI agent for understanding podcasts and long videos. It organizes each source into a structured summary, key ideas, supporting evidence, and source-grounded follow-up."
        },
        {
            question: "Is VibeDigest free to use?",
            answer: "Yes, VibeDigest offers a free Starter plan that allows you to summarize up to 3 videos per month with a 15-minute limit per video. For power users, we offer a Plus plan with unlimited summaries, longer video limits, and advanced features like Notion export."
        },
        {
            question: "Which platforms do you support?",
            answer: "Currently, we support YouTube, Apple Podcasts, Bilibili, and Xiaoyuzhou. We are constantly adding support for more platforms to help you consolidate your knowledge from various sources."
        },
        {
            question: "How reliable are the summary and answers?",
            answer: "AI can make mistakes. VibeDigest keeps the original source close and surfaces supporting evidence so you can verify important claims before relying on them."
        },
        {
            question: "Can I export my summaries?",
            answer: "Yes! You can export your summaries and notes to Markdown, PDF, or directly to Notion. This makes it easy to integrate your learning into your personal knowledge base (PKM)."
        },
        {
            question: "Do you support multiple languages?",
            answer: "Yes. VibeDigest can process sources in multiple languages and organize the summary and key ideas in a language you can read."
        }
    ],
    zh: [
        {
            question: "什么是 VibeDigest?",
            answer: "VibeDigest 是一个帮助你理解播客和长视频的 AI Agent。它会把原内容整理成结构化摘要、关键观点、支撑证据，并支持基于来源继续追问。"
        },
        {
            question: "VibeDigest 是免费的吗？",
            answer: "是的，VibeDigest 提供免费的入门版，允许您每月摘要最多 3 个视频（每个视频限时 15 分钟）。对于深度用户，我们要提供 Plus 版，包含无限摘要、更长的视频时长限制以及 Notion 导出等高级功能。"
        },
        {
            question: "你们支持哪些平台？",
            answer: "目前，我们支持 YouTube、Apple Podcasts、Bilibili 和小宇宙。我们正在不断增加对更多平台的支持，帮助您整合来自不同来源的知识。"
        },
        {
            question: "摘要和回答可靠吗？",
            answer: "AI 可能出错。VibeDigest 会保留原始内容入口并提供支撑证据，重要结论应在使用前回到来源核验。"
        },
        {
            question: "我可以导出摘要吗？",
            answer: "当然！您可以将摘要和笔记导出为 Markdown、PDF 或直接导出到 Notion。这使得将学习内容整合到您的个人知识库 (PKM) 变得非常容易。"
        },
        {
            question: "你们支持多种语言吗？",
            answer: "支持。VibeDigest 可以处理多种语言的内容，并把摘要和关键观点整理成你便于阅读的语言。"
        }
    ],
    ja: [
        {
            question: "VibeDigestとは何ですか？",
            answer: "VibeDigestは、ポッドキャストや長尺動画を理解するためのAI Agentです。要約、重要ポイント、根拠、出典に基づく追加質問に整理します。"
        },
        {
            question: "VibeDigestは無料で使えますか？",
            answer: "はい、VibeDigestは無料のStarterプランを提供しており、月3本まで（1本15分以内）の動画を要約できます。ヘビーユーザー向けに、無制限の要約、長時間動画対応、Notionエクスポートなどの高度な機能を備えたPlusプランもあります。"
        },
        {
            question: "どのプラットフォームに対応していますか？",
            answer: "現在、YouTube、Apple Podcasts、Bilibili、小宇宙に対応しています。さまざまなソースからの知識を統合できるよう、対応プラットフォームを順次追加しています。"
        },
        {
            question: "要約と回答は信頼できますか？",
            answer: "AIは誤ることがあります。VibeDigestは元のコンテンツへの導線と根拠を示し、重要な内容を出典で確認できるようにします。"
        },
        {
            question: "要約をエクスポートできますか？",
            answer: "もちろんです！要約やノートをMarkdown、PDF、またはNotionに直接エクスポートできます。個人のナレッジベース（PKM）に学習内容を統合するのが簡単になります。"
        },
        {
            question: "多言語に対応していますか？",
            answer: "はい。複数言語のコンテンツを処理し、要約と重要ポイントを読みやすい言語に整理できます。"
        }
    ]
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
    ja: {
        title: "よくある質問 (FAQ) - VibeDigest AI動画要約ツール",
        description: "VibeDigestに関するよくある質問と回答。AIによるYouTube動画の要約方法、料金プラン、対応プラットフォームについて。",
        ogDescription: "VibeDigestの機能、料金、対応プラットフォームに関するよくある質問。",
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
    const content = FAQS[lang] ?? FAQS.en
    const isZh = lang === "zh"
    const isJa = lang === "ja"

    // Schema.org FAQPage Structured Data
    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": content.map(item => ({
            "@type": "Question",
            "name": item.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": item.answer
            }
        }))
    }

    // BreadcrumbList Structured Data
    const breadcrumbLabels: Record<string, string> = {
        en: "FAQ",
        zh: "常见问题",
        ja: "よくある質問",
    }
    const homeLabels: Record<string, string> = {
        en: "Home",
        zh: "首页",
        ja: "ホーム",
    }
    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": homeLabels[lang] ?? homeLabels.en,
                "item": `https://vibedigest.io/${lang}`
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": breadcrumbLabels[lang] ?? breadcrumbLabels.en,
                "item": `https://vibedigest.io/${lang}/faq`
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
                            {isZh ? "常见问题" : isJa ? "よくある質問" : "Frequently Asked Questions"}
                        </h1>
                        <p className="text-base text-slate-600 dark:text-muted-foreground">
                            {isZh ? "关于 VibeDigest 您需要了解的一切" : isJa ? "VibeDigestについて知っておくべきすべて" : "Everything you need to know about VibeDigest"}
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
                            {isZh ? "还有其他问题？" : isJa ? "まだ質問がありますか？" : "Still have questions?"}
                        </h3>
                        <p className="text-slate-600 dark:text-muted-foreground mb-8 text-sm">
                            {isZh ? "我们随时为您提供帮助。发送邮件给我们。" : isJa ? "お気軽にお問い合わせください。" : "We're here to help. Send us an email."}
                        </p>
                        <Link
                            href={`/${lang}/about`}
                            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors mr-4"
                        >
                            {isZh ? "关于我们" : isJa ? "私たちについて" : "About Us"}
                        </Link>
                        <a
                            href="mailto:support@vibedigest.io"
                            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-indigo-600 dark:bg-white text-white dark:text-black font-medium hover:bg-indigo-700 dark:hover:bg-gray-200 transition-colors"
                        >
                            {isZh ? "联系支持" : isJa ? "サポートに連絡" : "Contact Support"}
                        </a>
                    </div>
                </div>
            </main>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
            />
        </div>
    )
}
