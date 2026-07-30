import { GoogleOneTap } from "@/components/auth/GoogleOneTap"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { HowItWorksSection } from "@/components/landing/HowItWorksSection"
import { PricingSection } from "@/components/landing/PricingSection"
import { SupportCTA } from "@/components/landing/SupportCTA"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { createTranslator, DEFAULT_LOCALE, isLocale } from "@/lib/i18n"

// HowTo schema step data per locale (mirrors i18n but accessible at server level)
const HOW_TO_STEPS: Record<string, { name: string; text: string }[]> = {
  en: [
    { name: "Paste Link", text: "Copy the URL from YouTube, Apple Podcasts, or Bilibili and paste it into our analyzer." },
    { name: "AI Processing", text: "Our advanced AI engine analyzes audio and video content to extract key insights." },
    { name: "Get Summary", text: "Receive a structured summary, transcript, and key takeaways." },
  ],
  zh: [
    { name: "粘贴链接", text: "复制 YouTube、Apple Podcasts 或 Bilibili 的链接并粘贴到我们的分析器中。" },
    { name: "AI 处理", text: "我们先进的 AI 引擎分析音频和视频内容以提取关键见解。" },
    { name: "获取摘要", text: "获得结构化摘要、逐字稿和理解要点。" },
  ],
  ja: [
    { name: "リンクを貼り付け", text: "YouTube、Apple Podcasts、またはBilibiliからURLをコピーし、アナライザーに貼り付けます。" },
    { name: "AI処理", text: "高度なAIエンジンが音声と動画コンテンツを分析し、重要な洞察を抽出します。" },
    { name: "要約を取得", text: "構造化された要約、文字起こし、重要ポイントを受け取ります。" },
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
      "Turn YouTube videos, podcasts, and lectures into structured summaries, transcripts, and searchable highlights.",
  },
  zh: {
    title: "VibeDigest - AI 视频摘要与转写工具",
    description:
      "将 YouTube 视频和播客整理为结构化摘要、逐字稿与可搜索要点。",
  },
  ja: {
    title: "VibeDigest - AI動画要約・文字起こしツール",
    description:
      "YouTube動画やポッドキャストを、構造化された要約、文字起こし、検索可能な要点に整理します。",
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
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const t = createTranslator(locale)

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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t("landing.communityTitle")}</h2>
            <span className="text-xs text-slate-500 dark:text-gray-500 hidden md:inline-block">{t("landing.communityHint")}</span>
          </div>

          <Suspense fallback={<TemplatesSkeleton />}>
            <ServerCommunityTemplates limit={8} showHeader={false} locale={locale} />
          </Suspense>

          <div className="mt-8 flex justify-center">
            <Link
              href={`/${locale}/explore`}
              className="group flex items-center gap-2 px-6 py-2.5 rounded-full text-sm bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-emerald-200 dark:hover:border-primary/50 text-slate-700 dark:text-white font-medium transition-all hover:shadow-lg dark:hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            >
              {t("landing.viewAll")}
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>

        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <SupportCTA />
      </main>

      <footer className="py-8 text-center text-slate-500 dark:text-gray-600 text-xs border-t border-slate-200 dark:border-white/5 relative z-10 bg-white/50 dark:bg-[#0A0A0A] backdrop-blur-sm">
        <p>{t("landing.footerCopyright", { year: new Date().getFullYear() })}</p>
          <div className="mt-3 flex justify-center gap-5">
            <Link href={`/${locale}/about`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{locale === 'zh' ? '关于我们' : locale === 'ja' ? '私たちについて' : 'About'}</Link>
            <Link href={`/${locale}/faq`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{locale === 'zh' ? '常见问题' : locale === 'ja' ? 'よくある質問' : 'FAQ'}</Link>
            <Link href={`/${locale}/privacy`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{locale === 'zh' ? '隐私政策' : locale === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy'}</Link>
            <Link href={`/${locale}/terms`} className="hover:text-slate-900 dark:hover:text-white transition-colors">{locale === 'zh' ? '服务条款' : locale === 'ja' ? '利用規約' : 'Terms of Service'}</Link>
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
