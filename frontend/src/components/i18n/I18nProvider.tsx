"use client"

import React, { createContext, useCallback, useEffect, useMemo } from "react"

import {
  isLocale,
  type Locale,
  type Messages,
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

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode
  locale: Locale
  messages: Messages
}) {
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // ignore
    }
  }, [locale])

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

  const t = useMemo(() => createTranslator(messages), [messages])

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>")
  return ctx
}
