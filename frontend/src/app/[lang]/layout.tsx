import type { Metadata } from "next";
import { Syne, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";

import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { Vignette } from "@/components/ui/vignette";
import { buildLocalizedPath, getOpenGraphLocale, SITE_URL } from "@/lib/seo";
import { env } from "@/env";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;

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
      default: "VibeDigest - AI Agent for Podcasts and Long Videos",
      template: "%s | VibeDigest",
    },
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
    authors: [{ name: "VibeDigest Team" }],
    creator: "VibeDigest",
    openGraph: {
      type: "website",
      locale: getOpenGraphLocale(lang),
      url: buildLocalizedPath(lang, ""),
      title: "VibeDigest - Transform Video & Audio into Structured Knowledge",
      description: "Understand long content with structured summaries, key ideas, evidence, and source-grounded follow-up.",
      siteName: "VibeDigest",
      images: [{
        url: "/ai-video-summarizer-transcriber-og.png",
        width: 1200,
        height: 630,
        alt: "VibeDigest Default Cover",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "VibeDigest - AI Podcast and Video Agent",
      description: "Turn podcasts and long videos into summaries, key ideas, evidence, and source-grounded answers.",
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
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
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
    <div
      lang={locale}
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
  );
}
