import type { Metadata } from "next"
import Link from "next/link"
import { LandingNav } from "@/components/landing/LandingNav"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

type Props = {
    params: Promise<{
        lang: string
    }>
}

const CONTENT: Record<string, { title: string; subtitle: string; positioning: string; useCases: { title: string; description: string }[]; founder: { name: string; role: string; bio: string } }> = {
    en: {
        title: "About VibeDigest - AI Video Summarizer",
        subtitle: "What is VibeDigest?",
        positioning: "VibeDigest is an AI-powered content transformation platform designed to help you master knowledge from any video or audio source. We believe that in an era of information explosion, the ability to quickly extract essence from long-form content is a superpower.",
        useCases: [
            {
                title: "Academic & Research",
                description: "Quickly summarize long lectures and research seminars into structured notes."
            },
            {
                title: "Professional Growth",
                description: "Digest industry podcasts and webinars without spending hours watching."
            },
            {
                title: "Content Creation",
                description: "Extract key insights and quotes from viral videos for your own research and writing."
            },
            {
                title: "Language Learning",
                description: "Understand foreign content with AI-assisted transcripts and translations."
            }
        ],
        founder: {
            name: "Neal Lin",
            role: "Founder of VibeDigest",
            bio: "A developer and content enthusiast passionate about building tools that bridge the gap between information and insight. VibeDigest was born out of a personal need to 'consume more while spending less time'."
        }
    },
    zh: {
        title: "关于 VibeDigest - AI 视频摘要助手",
        subtitle: "什么是 VibeDigest?",
        positioning: "VibeDigest 是一个 AI 驱动的内容转化平台，旨在帮助您从任何视频或音频源中掌握知识。我们相信，在信息爆炸的时代，从长内容中快速提取精华的能力是一种「超能力」。",
        useCases: [
            {
                title: "学术与研究",
                description: "将冗长的讲座和研究研讨会快速总结为结构化笔记。"
            },
            {
                title: "职业成长",
                description: "无需花费数小时观看，即可消化行业播客和网络研讨会。"
            },
            {
                title: "内容创作",
                description: "从热门视频中提取关键见解和引用，助力您的研究和创作。"
            },
            {
                title: "语言学习",
                description: "借助 AI 辅助的逐字稿和翻译，轻松理解外语内容。"
            }
        ],
        founder: {
            name: "Neal Lin",
            role: "VibeDigest 创始人",
            bio: "一名热爱开发和内容的开发者，热衷于构建能够弥合信息与洞察之间鸿沟的工具。VibeDigest 诞生于「在更短时间内吸收更多知识」的个人需求。"
        }
    },
    ja: {
        title: "VibeDigestについて - AI動画要約ツール",
        subtitle: "VibeDigestとは？",
        positioning: "VibeDigestは、あらゆる動画・音声ソースから知識を効率的に習得するためのAIコンテンツ変換プラットフォームです。情報爆発の時代において、長尺コンテンツからエッセンスを素早く抽出する力は「超能力」だと私たちは信じています。",
        useCases: [
            {
                title: "学術・研究",
                description: "長い講義や研究セミナーを構造化されたノートに素早くまとめます。"
            },
            {
                title: "キャリア成長",
                description: "何時間も視聴せずに、業界ポッドキャストやウェビナーの要点を把握。"
            },
            {
                title: "コンテンツ制作",
                description: "バズ動画から重要なインサイトや引用を抽出し、研究や執筆に活用。"
            },
            {
                title: "語学学習",
                description: "AIによる文字起こしと翻訳で、外国語コンテンツを理解。"
            }
        ],
        founder: {
            name: "Neal Lin",
            role: "VibeDigest 創設者",
            bio: "情報とインサイトの間のギャップを埋めるツール作りに情熱を注ぐ開発者兼コンテンツ愛好家。VibeDigestは「より短い時間でより多くの知識を吸収したい」という個人的なニーズから生まれました。"
        }
    }
}

const ABOUT_SEO: Record<string, { title: string; description: string }> = {
    en: {
        title: "About Us - VibeDigest AI Video Summarizer",
        description: "Learn about VibeDigest and the story behind it. Our mission is to help users efficiently absorb knowledge from long-form video and audio content using AI.",
    },
    zh: {
        title: "关于我们 - VibeDigest AI 视频摘要助手",
        description: "了解 VibeDigest 及其背后的故事。我们的使命是利用 AI 帮助用户高效吸收长视频和音频内容中的知识。",
    },
    ja: {
        title: "私たちについて - VibeDigest AI動画要約ツール",
        description: "VibeDigestとその背景をご紹介。AIを活用して長尺動画・音声コンテンツから効率的に知識を吸収することが私たちのミッションです。",
    },
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    const { lang } = params
    const seo = ABOUT_SEO[lang] ?? ABOUT_SEO.en

    const title = seo.title
    const description = seo.description
    const path = "/about"

    return {
        title,
        description,
        alternates: {
            canonical: buildLocalizedPath(lang, path),
            languages: buildAlternateLanguages(path),
        },
        openGraph: {
            title,
            description,
            url: buildLocalizedPath(lang, path),
        },
        twitter: {
            title,
            description,
        }
    }
}

export default async function AboutPage(props: Props) {
    const params = await props.params;
    const { lang } = params
    const isZh = lang === "zh"
    const isJa = lang === "ja"
    const content = CONTENT[lang] ?? CONTENT.en

    // Organization Schema
    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "VibeDigest",
        "url": "https://vibedigest.io",
        "logo": "https://vibedigest.io/icon.png",
        "founder": {
            "@type": "Person",
            "name": "Neal Lin"
        },
        "description": content.positioning
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
            <div className="fixed inset-0 hidden dark:block pointer-events-none -z-10 bg-[#0A0A0A]">
                <div className="absolute inset-0 bg-grid opacity-20" />
            </div>

            <LandingNav />

            <main className="relative pt-32 pb-20 px-6 z-10">
                <div className="max-w-4xl mx-auto">
                    {/* Hero Section */}
                    <div className="text-center mb-24">
                        <h1 className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-white/60 mb-8">
                            {content.title}
                        </h1>
                        <h2 className="text-xl md:text-2xl font-medium text-indigo-600 dark:text-primary mb-12">
                            {content.subtitle}
                        </h2>
                        <div className="max-w-3xl mx-auto">
                            <p className="text-lg text-slate-600 dark:text-muted-foreground leading-relaxed">
                                {content.positioning}
                            </p>
                        </div>
                    </div>

                    {/* Use Cases Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-24">
                        {content.useCases.map((useCase, index) => (
                            <div
                                key={index}
                                className="p-8 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/10 transition-all duration-300 group shadow-lg dark:shadow-none"
                            >
                                <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-white/90 group-hover:text-indigo-600 dark:group-hover:text-primary transition-colors">
                                    {useCase.title}
                                </h3>
                                <p className="text-slate-600 dark:text-muted-foreground leading-relaxed text-sm">
                                    {useCase.description}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Founder Section */}
                    <div className="relative p-10 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 dark:from-emerald-500/10 via-transparent to-transparent border border-slate-200 dark:border-white/10 overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 dark:bg-emerald-500/10 blur-[100px] -z-10" />

                        <div className="flex flex-col md:flex-row gap-10 items-center md:items-start text-center md:text-left">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 dark:from-gray-200 dark:to-gray-500 border-4 border-white/20 dark:border-white/10 flex-shrink-0 flex items-center justify-center text-slate-700 dark:text-black overflow-hidden">
                                <span className="text-4xl font-bold">NL</span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">{content.founder.name}</h3>
                                <p className="text-indigo-600 dark:text-primary font-medium mb-6">{content.founder.role}</p>
                                <p className="text-base text-slate-600 dark:text-muted-foreground leading-relaxed italic">
                                    &ldquo;{content.founder.bio}&rdquo;
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-24 text-center">
                        <p className="text-slate-600 dark:text-muted-foreground mb-8">
                            {isZh ? "准备好提升您的效率了吗？" : isJa ? "効率を上げる準備はできましたか？" : "Ready to boost your efficiency?"}
                        </p>
                        <Link
                            href={`/${lang}/login`}
                            className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-indigo-600 dark:bg-primary text-white dark:text-primary-foreground font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-500/20 dark:shadow-primary/20"
                        >
                            {isZh ? "立即开始使用" : isJa ? "今すぐ始める" : "Get Started Now"}
                        </Link>
                    </div>
                </div>
            </main>

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
            />
        </div>
    )
}
