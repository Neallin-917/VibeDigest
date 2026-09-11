import { GoogleOneTap } from "@/components/auth/GoogleOneTap"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { PricingSection } from "@/components/landing/PricingSection"
import { LandingFAQ } from "@/components/landing/LandingFAQ"
import { SupportCTA } from "@/components/landing/SupportCTA"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { TopicHubLinks } from "@/components/templates/TopicHubLinks"
import { TemplatesSkeleton } from "@/components/templates/TemplatesSkeleton"
import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { getLandingFaqItems } from "@/lib/billing/faq-content"
import { buildFaqPageSchema, serializeJsonLd } from "@/lib/billing/structured-data"

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
}

const HOW_TO_NAME: Record<string, string> = {
  en: "How to use the VibeDigest agent for podcasts and videos",
  zh: "如何使用 VibeDigest Agent 看播客和视频",
}

const HOW_TO_DESC: Record<string, string> = {
  en: "Turn a podcast or video into a digest you can read and question in 3 steps",
  zh: "3 步获得可以阅读和继续追问的整理结果",
}

const SEO_COPY: Record<string, { title: string; description: string }> = {
  en: {
    title: "VibeDigest - AI Agent for Podcasts and Long Videos",
    description:
      "Let an AI agent organize podcasts and long videos into summaries, key ideas, evidence, and source-grounded follow-up.",
  },
  zh: {
    title: "VibeDigest - 帮你看播客的 AI Agent",
    description:
      "让 AI Agent 把播客和长视频整理成摘要、关键观点和证据，并基于原内容继续回答问题。",
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
  const landingFaqSchema = buildFaqPageSchema(getLandingFaqItems(t))

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-sans text-foreground selection:bg-primary/20 selection:text-primary-strong">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-primary-strong px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {t("landing.skipToContent")}
      </a>

      {/* Login & Nav */}
      <GoogleOneTap />
      <LandingNav />

      <main id="main-content" tabIndex={-1} className="w-full flex-1 outline-none">
        <HeroSection />

        <section id="agent-output" aria-labelledby="community-title" className="scroll-mt-24 border-y border-border bg-surface-subtle px-4 py-20 text-foreground sm:px-6 md:py-24 lg:px-10 xl:px-6">
          <div className="mx-auto max-w-[1080px]">
            <div className="flex items-end justify-between gap-8">
              <div className="max-w-2xl">
                <h2 id="community-title" className="text-[clamp(2rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.038em] text-foreground">
                  {t("landing.communityTitle")}
                </h2>
                <TopicHubLinks
                  locale={locale}
                  title={locale === "zh" ? "主题" : "Topics"}
                  className="mt-6"
                />
              </div>
              <Link
                href={`/${locale}/explore`}
                className="group hidden min-h-11 shrink-0 items-center gap-2 text-[12px] font-semibold text-primary transition-colors hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
              >
                {t("landing.viewAll")}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>

            <div className="mt-10 overflow-hidden border border-border-strong bg-border-strong [&_.animate-pulse]:!bg-card/55">
              <Suspense fallback={<TemplatesSkeleton count={4} layout="landingPreview" />}>
                <ServerCommunityTemplates limit={4} layout="landingPreview" showHeader={false} locale={locale} />
              </Suspense>
            </div>

            <div className="mt-6 flex sm:hidden">
              <Link
                href={`/${locale}/explore`}
                className="group inline-flex min-h-11 items-center gap-2 text-[12px] font-semibold text-primary transition-colors hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("landing.viewAll")}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </section>

        <FeaturesSection />
        <PricingSection />
        <LandingFAQ />
        <SupportCTA />
      </main>

      <footer className="border-t border-border bg-background py-8 text-center text-xs text-foreground-subtle">
        <p>{t("landing.footerCopyright", { year: new Date().getFullYear() })}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-x-5">
            <Link href={`/${locale}/about`} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">{locale === 'zh' ? '关于我们' : 'About'}</Link>
            <Link href={`/${locale}/faq`} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">{locale === 'zh' ? '常见问题' : 'FAQ'}</Link>
            <Link href={`/${locale}/privacy`} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">{locale === 'zh' ? '隐私政策' : 'Privacy Policy'}</Link>
            <Link href={`/${locale}/terms`} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground">{locale === 'zh' ? '服务条款' : 'Terms of Service'}</Link>
          </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(landingFaqSchema) }}
      />
    </div>
  )
}
