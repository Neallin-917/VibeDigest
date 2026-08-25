import { GoogleOneTap } from "@/components/auth/GoogleOneTap"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { HowItWorksSection } from "@/components/landing/HowItWorksSection"
import { PricingSection } from "@/components/landing/PricingSection"
import { LandingFAQ } from "@/components/landing/LandingFAQ"
import { SupportCTA } from "@/components/landing/SupportCTA"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"

// HowTo schema step data per locale (mirrors i18n but accessible at server level)
const HOW_TO_STEPS: Record<string, { name: string; text: string }[]> = {
  en: [
    { name: "Paste a podcast or video link", text: "Copy a supported podcast or video URL and paste it into VibeDigest." },
    { name: "Let the agent organize it", text: "VibeDigest transcribes the source and organizes its summary and key ideas." },
    { name: "Read and follow up", text: "Read the digest and ask follow-up questions grounded in the source." },
  ],
  zh: [
    { name: "粘贴播客或视频链接", text: "复制受支持的播客或视频链接并粘贴到 VibeDigest。" },
    { name: "让 Agent 整理", text: "VibeDigest 转写原内容，并整理摘要和关键观点。" },
    { name: "阅读并继续追问", text: "阅读整理结果，并基于原内容继续提问。" },
  ],
  ja: [
    { name: "ポッドキャストや動画のリンクを貼る", text: "対応するポッドキャストや動画のURLをVibeDigestに貼り付けます。" },
    { name: "Agentに整理を任せる", text: "VibeDigestが文字起こしを行い、要約と重要ポイントを整理します。" },
    { name: "読んで続けて質問する", text: "整理結果を読み、元の内容に基づいて続けて質問できます。" },
  ],
}

const HOW_TO_NAME: Record<string, string> = {
  en: "How to use the VibeDigest agent for podcasts and videos",
  zh: "如何使用 VibeDigest Agent 看播客和视频",
  ja: "VibeDigest Agentでポッドキャストや動画を見る方法",
}

const HOW_TO_DESC: Record<string, string> = {
  en: "Turn a podcast or video into a digest you can read and question in 3 steps",
  zh: "3 步获得可以阅读和继续追问的整理结果",
  ja: "3ステップで読んで質問できる整理結果を得る",
}

const SEO_COPY: Record<string, { title: string; description: string }> = {
  en: {
    title: "VibeDigest - AI Agent for Podcasts and Long Videos",
    description:
      "Let an AI agent organize podcasts and long videos into summaries, key ideas, transcripts, and source-grounded follow-up.",
  },
  zh: {
    title: "VibeDigest - 帮你看播客的 AI Agent",
    description:
      "让 AI Agent 把播客和长视频整理成摘要、关键观点、逐字稿，并基于原内容继续回答问题。",
  },
  ja: {
    title: "VibeDigest - ポッドキャストと長尺動画のAI Agent",
    description:
      "AI Agentがポッドキャストや長尺動画を要約、重要ポイント、文字起こしに整理し、元の内容に基づいて質問に答えます。",
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
    <div className="relative flex min-h-screen flex-col bg-background font-sans text-slate-800 selection:bg-primary/20 selection:text-primary dark:text-zinc-100">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 dark:bg-emerald-400 dark:text-zinc-950 dark:focus:ring-emerald-200 dark:focus:ring-offset-zinc-950"
      >
        {t("landing.skipToContent")}
      </a>

      {/* Login & Nav */}
      <GoogleOneTap />
      <LandingNav />

      <main id="main-content" tabIndex={-1} className="w-full flex-1 outline-none">
        <HeroSection />

        <section id="agent-output" aria-labelledby="community-title" className="mx-auto mb-24 max-w-[1600px] scroll-mt-24 px-6">
          <div className="flex items-end justify-between gap-8">
            <div className="max-w-2xl">
              <h2 id="community-title" className="font-display text-2xl font-bold tracking-[-0.025em] text-slate-900 md:text-3xl dark:text-white">
                {t("landing.communityTitle")}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-zinc-400">{t("landing.communityHint")}</p>
            </div>
            <Link
              href={`/${locale}/explore`}
              className="group hidden min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:inline-flex dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              {t("landing.viewAll")}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>

          <div className="mt-8">
            <Suspense fallback={<TemplatesSkeleton count={4} layout="landingPreview" />}>
              <ServerCommunityTemplates limit={4} layout="landingPreview" showHeader={false} locale={locale} />
            </Suspense>
          </div>

          <div className="mt-6 flex sm:hidden">
            <Link
              href={`/${locale}/explore`}
              className="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              {t("landing.viewAll")}
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </section>

        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <LandingFAQ />
        <SupportCTA />
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-500">
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
