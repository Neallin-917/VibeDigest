import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Syne, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";

import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { Vignette } from "@/components/ui/vignette";
import { buildLocalizedPath, getOpenGraphLocale, SITE_URL } from "@/lib/seo";
import { env } from "@/env";
import { SUPPORTED_LOCALES, isLocale, type Locale } from "@/lib/i18n";
import { createTranslator, getMessages } from "@/lib/i18n-server";
import { buildSoftwareApplicationSchema, serializeJsonLd } from "@/lib/billing/structured-data";

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-syne",
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

import { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#f3f1ea',
  width: 'device-width',
  initialScale: 1,
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }))
}

// Route-level SEO copy lives here because these strings describe the whole
// locale segment rather than an individual UI surface.
const LOCALE_METADATA: Record<Locale, {
  title: string;
  description: string;
  keywords: string[];
  openGraphTitle: string;
  openGraphDescription: string;
  twitterTitle: string;
  imageAlt: string;
}> = {
  en: {
    title: "VibeDigest - AI Agent for Podcasts and Long Videos",
    description: "Turn podcasts and long videos into summaries, key ideas, evidence, and source-grounded answers.",
    keywords: [
      "AI video summarizer",
      "YouTube video to text",
      "video summarizer AI",
      "podcast summary agent",
      "summarize YouTube video",
      "video to notes",
      "study assistant",
      "content repurposing",
    ],
    openGraphTitle: "VibeDigest - Transform Video & Audio into Structured Knowledge",
    openGraphDescription: "Understand long content with structured summaries, key ideas, evidence, and source-grounded follow-up.",
    twitterTitle: "VibeDigest - AI Podcast and Video Agent",
    imageAlt: "VibeDigest default cover",
  },
  zh: {
    title: "VibeDigest - 播客与长视频 AI Agent",
    description: "将播客和长视频整理为摘要、关键观点、证据，以及基于来源的回答。",
    keywords: [
      "AI 视频摘要",
      "YouTube 视频总结",
      "播客摘要",
      "长视频总结",
      "视频转笔记",
      "AI 学习助手",
    ],
    openGraphTitle: "VibeDigest - 将视频与音频整理为结构化知识",
    openGraphDescription: "用结构化摘要、关键观点、证据和基于来源的追问，快速理解长内容。",
    twitterTitle: "VibeDigest - 播客与视频 AI Agent",
    imageAlt: "VibeDigest 默认封面",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound()
  const locale = lang
  const copy = LOCALE_METADATA[locale];

  return {
    applicationName: "VibeDigest",
    metadataBase: new URL(SITE_URL),
    formatDetection: {
      telephone: false,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "VibeDigest",
    },
    title: {
      default: copy.title,
      template: "%s | VibeDigest",
    },
    description: copy.description,
    keywords: copy.keywords,
    authors: [{ name: "VibeDigest Team" }],
    creator: "VibeDigest",
    openGraph: {
      type: "website",
      locale: getOpenGraphLocale(locale),
      url: buildLocalizedPath(locale, ""),
      title: copy.openGraphTitle,
      description: copy.openGraphDescription,
      siteName: "VibeDigest",
      images: [{
        url: "/ai-video-summarizer-transcriber-og.png",
        width: 1200,
        height: 630,
        alt: copy.imageAlt,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.twitterTitle,
      description: copy.description,
      creator: "@vibedigest",
      site: "@vibedigest",
      images: ["/ai-video-summarizer-transcriber-og.png"],
    },
    verification: {
      google: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
      other: {
        "msvalidate.01": env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "",
      }
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

import { Toaster } from "sonner";

export default async function RootLayout({
  children,
  auth,
  params
}: Readonly<{
  children: React.ReactNode;
  auth: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound()
  const locale = lang
  const messages = getMessages(locale);
  const t = createTranslator(locale);
  const structuredData = [
    buildSoftwareApplicationSchema(t),
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "VibeDigest",
      "alternateName": ["Vibe Digest", "AI Video Summarizer"],
      "url": "https://vibedigest.io"
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "VibeDigest",
      "url": "https://vibedigest.io",
      "logo": "https://vibedigest.io/icon.png",
      "sameAs": ["https://twitter.com/vibedigest"]
    },
  ];
  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div
          className={cn(
            manrope.className,
            syne.variable,
            jakarta.variable,
            "min-h-screen text-foreground antialiased font-sans tracking-tight"
          )}
        >
          <Vignette />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: serializeJsonLd(structuredData)
            }}
          />
          <Providers locale={locale} messages={messages}>
            {auth}
            {children}
          </Providers>
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </div>
      </body>
    </html>
  );
}
