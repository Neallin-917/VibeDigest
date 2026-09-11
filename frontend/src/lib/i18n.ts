// Mainstream internet/UI languages (UI locales).
export const SUPPORTED_LOCALES = ["en", "zh"] as const

export type Locale = typeof SUPPORTED_LOCALES[number]

export const DEFAULT_LOCALE: Locale = "en"

export const COOKIE_NAME = "vd_locale"

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  zh: "中文",
}

export const LOCALE_DISPLAY_NAME: Record<Locale, Record<Locale, string>> = {
  en: { en: "English", zh: "Chinese" },
  zh: { en: "英文", zh: "中文" },
}

export function getLocaleDisplayName(locale: Locale, displayLocale: Locale) {
  return LOCALE_DISPLAY_NAME[displayLocale][locale]
}

export const LOCALE_DATE_TAG: Record<Locale, string> = {
  en: "en-US",
  zh: "zh-CN",
}

export type MessageValue = string | Messages

export interface Messages {
  [key: string]: MessageValue
}

function resolvePath(obj: Messages, key: string): MessageValue | undefined {
  const parts = key.split(".").filter(Boolean)
  let cur: MessageValue = obj
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined
    cur = (cur as Messages)[part]
    if (cur === undefined) return undefined
  }
  return cur
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name]
    return value === undefined || value === null ? `{${name}}` : String(value)
  })
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function createTranslator(
  primaryMessages: Messages,
  fallbackMessages?: Messages,
) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const primary = resolvePath(primaryMessages, key)
    if (primary !== undefined) {
      return typeof primary === "string" ? format(primary, vars) : key
    }

    const fallback = fallbackMessages
      ? resolvePath(fallbackMessages, key)
      : undefined
    if (fallback !== undefined) {
      return typeof fallback === "string" ? format(fallback, vars) : key
    }

    return key
  }
}
