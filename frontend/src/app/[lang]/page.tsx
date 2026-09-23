import { GoogleOneTap } from "@/components/auth/GoogleOneTap"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { PricingSection } from "@/components/landing/PricingSection"
import { LandingFAQ } from "@/components/landing/LandingFAQ"
import { ServerCommunityTemplates } from "@/components/templates/ServerCommunityTemplates"
import { LANDING_PREVIEW_LIMIT } from "@/components/templates/landingPreviewLayout"
import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { getLandingFaqItems } from "@/lib/billing/faq-content"
import { buildFaqPageSchema, serializeJsonLd } from "@/lib/billing/structured-data"

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
      <LandingNav variant="home" />

      <main id="main-content" tabIndex={-1} className="w-full flex-1 outline-none">
        <HeroSection />

        <section id="agent-output" aria-labelledby="community-title" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-24 lg:px-10 xl:px-6">
          <div className="mx-auto max-w-[1080px]">
            <div className="mb-7 flex items-center justify-between gap-4 sm:items-end sm:gap-6">
              <h2 id="community-title" className="max-w-[220px] text-[25px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:max-w-none sm:text-[32px]">
                {t("landing.communityTitle")}
              </h2>
              <Link href={`/${locale}/explore`} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-xs font-semibold text-primary-strong hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-primary sm:text-sm">
                {t("landing.viewAll")} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <Suspense fallback={<div className="min-h-32" aria-busy="true" />}>
              <ServerCommunityTemplates limit={LANDING_PREVIEW_LIMIT} layout="landingPreview" showHeader={false} locale={locale} />
            </Suspense>
          </div>
        </section>

        <PricingSection />
        <LandingFAQ />
      </main>

      <footer className="mx-auto mt-10 w-[calc(100%-40px)] max-w-[1080px] border-t border-border py-7 text-xs text-foreground-subtle sm:mt-14 sm:w-[calc(100%-48px)]">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <span className="font-semibold text-foreground">VibeDigest</span>
          <p>{t("landing.footerCopyright", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap gap-x-5">
            <Link href={`/${locale}/about`} className="inline-flex min-h-11 items-center hover:text-foreground">{locale === 'zh' ? '关于我们' : 'About'}</Link>
            <Link href={`/${locale}/faq`} className="inline-flex min-h-11 items-center hover:text-foreground">{locale === 'zh' ? '常见问题' : 'FAQ'}</Link>
            <Link href={`/${locale}/privacy`} className="inline-flex min-h-11 items-center hover:text-foreground">{locale === 'zh' ? '隐私政策' : 'Privacy Policy'}</Link>
            <Link href={`/${locale}/terms`} className="inline-flex min-h-11 items-center hover:text-foreground">{locale === 'zh' ? '服务条款' : 'Terms of Service'}</Link>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(landingFaqSchema) }}
      />
    </div>
  )
}
