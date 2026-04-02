import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const isZh = lang === "zh"
  const path = "/privacy"

  const title = isZh ? "隐私政策 - VibeDigest" : "Privacy Policy - VibeDigest"
  const description = isZh
    ? "了解 VibeDigest 如何收集、使用与保护您的个人信息。"
    : "Learn how VibeDigest collects, uses, and protects your personal information."

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
    },
  }
}

export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
