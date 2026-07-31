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
import { getMessages } from "@/lib/i18n-server";

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
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
      default: "VibeDigest - AI Video Summarizer & Transcriber for YouTube",
      template: "%s | VibeDigest",
    },
    description: "Free AI Video Summarizer & YouTube to Text Converter. Get instant summaries, transcripts, and structured notes from YouTube videos.",
    keywords: [
      "AI video summarizer",
      "YouTube video to text",
      "video summarizer AI",
      "YouTube transcript generator",
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
      description: "Efficiently absorb long content. Get AI-powered structured summaries, interactive transcripts, and translations for efficient learning.",
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
      title: "VibeDigest - AI Video Summarizer & Transcriber",
      description: "Free AI Video Summarizer & YouTube to Text Converter. Get instant summaries and transcripts from YouTube videos.",
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
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "VibeDigest",
              "applicationCategory": "ProductivityApplication",
              "applicationSubCategory": "AI Video Summarizer",
              "operatingSystem": "Web",
              "url": "https://vibedigest.io",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
              },
              "description": "AI-powered tool to transform videos and podcasts into structured insights.",
            },
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
              "sameAs": [
                "https://twitter.com/vibedigest"
              ]
            }
          ])
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
