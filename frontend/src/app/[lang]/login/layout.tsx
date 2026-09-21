import type { Metadata } from "next"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const path = "/login"
  const t = createTranslator(locale)

  return {
    title: t("metadata.login.title"),
    description: t("metadata.login.description"),
    alternates: {
      canonical: buildLocalizedPath(locale, path),
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
