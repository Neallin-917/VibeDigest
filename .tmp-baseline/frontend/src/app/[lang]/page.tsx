import { GoogleOneTap } from "@/components/auth/GoogleOneTap"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { HowItWorksSection } from "@/components/landing/HowItWorksSection"
import { PricingSection } from "@/components/landing/PricingSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { SupportCTA } from "@/components/landing/SupportCTA"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

// HowTo schema step data per locale (mirrors i18n but accessible at server level)
const HOW_TO_STEPS: Record<string, { name: string; text: string }[]> = {
  en: [
    { name: "Paste Link", text: "Copy the URL from YouTube, Apple Podcasts, or Bilibili and paste it into our analyzer." },
    { name: "AI Processing", text: "Our advanced AI engine analyzes audio and video content to extract key insights." },
    { name: "Get Summary", text: "Receive accurate structured summary, interactive transcript, and mind map." },
  ],
  zh: [
    { name: "粘贴链接", text: "复制 YouTube、Apple Podcasts 或 Bilibili 的链接并粘贴到我们的分析器中。" },
    { name: "AI 处理", text: "我们先进的 AI 引擎分析音频和视频内容以提取关键见解。" },
    { name: "获取摘要", text: "接收准确的结构化摘要、交互式逐字稿和思维导图。" },
  ],
  ja: [
    { name: "リンクを貼り付け", text: "YouTube、Apple Podcasts、またはBilibiliからURLをコピーし、アナライザーに貼り付けます。" },
    { name: "AI処理", text: "高度なAIエンジンが音声と動画コンテンツを分析し、重要な洞察を抽出します。" },
    { name: "要約を取得", text: "正確で構造化された要約、インタラクティブな文字起こし、マインドマップを受け取ります。" },
  ],
}

const HOW_TO_NAME: Record<string, string> = {
  en: "How to summarize a video with VibeDigest",
  zh: "如何使用 VibeDigest 摘要视频",
  ja: "VibeDigestで動画を要約する方法",
}

const HOW_TO_DESC: Record<string, string> = {
  en: "Get your summary in 3 simple steps",
  zh: "只需简单 3 步即可获取摘要",
  ja: "3つの簡単なステップで要約を取得",
}

const SEO_COPY: Record<string, { title: string; description: string }> = {
  en: {
    title: "VibeDigest - AI Video Summarizer & Transcriber for YouTube",
    description:
      "Summarize YouTube videos, podcasts, and lectures in seconds. Get AI transcripts, structured notes, and searchable highlights with VibeDigest.",
  },
  zh: {
    title: "VibeDigest - AI 视频摘要与转写工具",
    description:
      "秒级生成 YouTube 和播客的摘要与逐字稿。用 VibeDigest 获取结构化笔记与可搜索要点。",
  },
  ja: {
    title: "VibeDigest - AI動画要約・文字起こしツール",
    description:
      "YouTube動画やポッドキャストを数秒で要約。AIによる文字起こし、構造化ノート、検索可能なハイライトを取得。",
  },
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const meta = SEO_COPY[lang] ?? SEO_COPY.en

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: buildLocalizedPath(lang, ""),
      languages: buildAlternateLanguages(""),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: buildLocalizedPath(lang, ""),
    },
    twitter: {
      title: meta.title,
      description: meta.description,
    },
  }
}

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;

  const steps = HOW_TO_STEPS[lang] ?? HOW_TO_STEPS.en
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": HOW_TO_NAME[lang] ?? HOW_TO_NAME.en,
    "description": HOW_TO_DESC[lang] ?? HOW_TO_DESC.en,
    "step": steps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text,
    })),
  }

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-slate-800 dark:text-zinc-100 relative overflow-hidden font-sans selection:bg-primary/20 selection:text-primary">

      {/* Background Blobs (Light Mode) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none dark:hidden -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-emerald-100/40 rounded-full blur-[100px] mix-blend-multiply animate-float-slow" />
        <div className="absolute top-[20%] left-[-10%] w-[35%] h-[35%] bg-teal-100/40 rounded-full blur-[100px] mix-blend-multiply animate-float-slow" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-cyan-100/40 rounded-full blur-[100px] mix-blend-multiply animate-float-slow" style={{ animationDelay: '4s' }} />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")` }}></div>
      </div>

      {/* Dark Mode Background - refined deep space */}
      <div className="fixed inset-0 hidden dark:block pointer-events-none -z-10 bg-[#050505]">
        {/* Subtle top glow */}
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[80%] h-[60%] bg-emerald-900/10 rounded-[100%] blur-[120px]" />

        {/* Moving aurora elements */}
        <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-teal-900/10 rounded-full blur-[100px] animate-float-slow" style={{ animationDuration: '10s' }} />

        {/* Grid Overlay with fade out */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]" />
      </div>

      {/* Login & Nav */}
      <GoogleOneTap />
      <LandingNav />

      <main className="flex-1 w-full relative z-10">
        <HeroSection />

        {/* Community Section */}
        <div id="demos" className="max-w-6xl mx-auto px-6 mb-20 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-emerald-700 dark:bg-primary rounded-full"></div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Community</h2>
            <span className="text-xs text-slate-500 dark:text-gray-500 hidden md:inline-block">Curated public demos. Your tasks are private.</span>
          </div>

          <Suspense fallback={<TemplatesSkeleton />}>
            <ServerCommunityTemplates limit={8} showHeader={false} />
          </Suspense>

          <div className="mt-8 flex justify-center">
            <Link
              href={`/${lang}/explore`}
              className="group flex items-center gap-2 px-6 py-2.5 rounded-full text-sm bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-emerald-200 dark:hover:border-primary/50 text-slate-700 dark:text-white font-medium transition-all hover:shadow-lg dark:hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            >
              View All
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>

        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <TestimonialsSection />
        <SupportCTA />
      </main>

      <footer className="py-8 text-center text-slate-500 dark:text-gray-600 text-xs border-t border-slate-200 dark:border-white/5 relative z-10 bg-white/50 dark:bg-[#0A0A0A] backdrop-blur-sm">
        <p>© 2024 VibeDigest. All rights reserved.</p>
          <div className="mt-3 flex justify-center gap-5">
            <Link href={`/${lang}/about`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '关于我们' : lang === 'ja' ? '私たちについて' : 'About'}</Link>
            <Link href={`/${lang}/faq`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '常见问题' : lang === 'ja' ? 'よくある質問' : 'FAQ'}</Link>
            <Link href={`/${lang}/privacy`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '隐私政策' : lang === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}</Link>
            <Link href={`/${lang}/terms`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{lang === 'zh' ? '服务条款' : lang === 'ja' ? '利用規約' : 'Terms of Service'}</Link>
          </div>
      </footer>

      {/* HowTo structured data - uses server-side constants, safe from XSS */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
    </div>
  )
}
