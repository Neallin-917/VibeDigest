import { DEFAULT_LOCALE, LOCALE_DATE_TAG, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n"
import { env } from "@/env"

export const SITE_URL =
  env.NEXT_PUBLIC_APP_URL ||
  env.NEXT_PUBLIC_BASE_URL ||
  env.FRONTEND_URL ||
  "https://vibedigest.io"

const normalizePath = (path: string) => {
  if (!path || path === "/") return ""
  return path.startsWith("/") ? path : `/${path}`
}

export const buildLocalizedPath = (locale: string, path: string) => {
  const suffix = normalizePath(path)
  return `${SITE_URL}/${locale}${suffix}`
}

export const buildAlternateLanguages = (path: string) => {
  const suffix = normalizePath(path)
  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, `${SITE_URL}/${locale}${suffix}`])
  ) as Record<string, string>

  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}${suffix}`
  return languages
}

export const getOpenGraphLocale = (locale: string) => {
  const tag = LOCALE_DATE_TAG[locale as Locale] || "en-US"
  return tag.replace("-", "_")
}
