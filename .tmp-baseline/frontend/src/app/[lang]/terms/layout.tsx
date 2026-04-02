import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const isZh = lang === "zh"
  const path = "/terms"

  const title = isZh ? "服务条款 - VibeDigest" : "Terms of Service - VibeDigest"
  const description = isZh
    ? "查看 VibeDigest 的服务条款与使用规范。"
    : "Review VibeDigest terms of service and usage guidelines."

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

export default function TermsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
