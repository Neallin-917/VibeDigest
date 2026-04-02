import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const path = "/login"
  const title = "Log In - VibeDigest"
  const description = "Sign in to VibeDigest to access your workspace and saved summaries."

  return {
    title,
    description,
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

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
