import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const path = "/chat"

  return {
    title: "Chat - VibeDigest",
    description: "Chat with your videos and explore summaries inside VibeDigest.",
    alternates: {
      canonical: buildLocalizedPath(lang, path),
      languages: buildAlternateLanguages(path),
    },
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
