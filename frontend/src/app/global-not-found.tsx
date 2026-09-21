import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"

import "./globals.css"

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"

const LOCALE_HEADER = "x-vd-locale"

async function getRequestLocale(): Promise<Locale> {
  const locale = (await headers()).get(LOCALE_HEADER)
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale())

  return {
    title: t("notFound.title"),
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function GlobalNotFound() {
  const locale = await getRequestLocale()
  const t = createTranslator(locale)

  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
          <div className="text-center max-w-md">
            <p className="text-8xl font-extrabold text-foreground-soft mb-6">404</p>
            <h1 className="text-2xl md:text-3xl font-bold mb-4">{t("notFound.title")}</h1>
            <p className="text-muted-foreground mb-10 leading-relaxed">
              {t("notFound.description")}
            </p>
            <Link
              href={`/${locale}`}
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              {t("notFound.home")}
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
