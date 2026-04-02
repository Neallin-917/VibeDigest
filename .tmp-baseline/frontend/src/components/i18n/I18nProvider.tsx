"use client"

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react"

import {
  DEFAULT_LOCALE,
  getBestLocaleFromNavigator,
  isLocale,
  type Locale,
  createTranslator,
  COOKIE_NAME,
} from "@/lib/i18n"

const STORAGE_KEY = "vd.locale" // Keep for legacy/client-side preference persistence if needed

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children, locale: initialLocale }: { children: React.ReactNode, locale?: Locale }) {
  // Initialize with server-provided locale if available, effectively synching URL and UI
  const [locale, setLocaleState] = useState<Locale>(initialLocale || DEFAULT_LOCALE)

  // Load persisted locale after mount (client-only)
  useEffect(() => {
    let cancelled = false
    try {
      // Priority: 1. URL/Server (initialLocale passed prop) -> handled by useState default
      // 2. localStorage (user preference) - BUT only if we didn't get a specific URL locale?
      // Actually, standard behavior: URL overrides everything.
      // If we are at /zh, we show Chinese.
      // We should update localStorage to match the current URL locale if it differs.

      if (initialLocale && isLocale(initialLocale)) {
        window.localStorage.setItem(STORAGE_KEY, initialLocale)
      } else {
        // Fallback logic if no prop provided (legacy support)
        const stored = window.localStorage.getItem(STORAGE_KEY)
        const next = isLocale(stored) ? stored : getBestLocaleFromNavigator(window.navigator.language)
        Promise.resolve().then(() => {
          if (!cancelled && !initialLocale) setLocaleState(next)
        })
      }
    } catch {
      // ignore
    }
    return () => {
      cancelled = true
    }
  }, [initialLocale])

  // Sync document attributes
  useEffect(() => {
    try {
      document.documentElement.lang = locale
      document.documentElement.dir = "ltr"
    } catch {
      // ignore
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    // 1. Set Cookie
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`

    // 2. Set LocalStorage (sync)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }

    // 3. Navigate to locale-prefixed route
    const { pathname, search, hash } = window.location
    const segments = pathname.split("/")
    if (segments.length > 1 && isLocale(segments[1])) {
      segments[1] = next
    } else {
      segments.splice(1, 0, next)
    }
    const nextPath = segments.join("/") || "/"
    window.location.assign(`${nextPath}${search}${hash}`)
  }, [])

  const t = useMemo(() => createTranslator(locale), [locale])

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>")
  return ctx
}

