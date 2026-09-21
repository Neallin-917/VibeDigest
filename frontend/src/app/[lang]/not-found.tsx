"use client"

import Link from "next/link"
import { useI18n } from "@/components/i18n/I18nProvider"

export default function NotFound() {
  const { locale, t } = useI18n()

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent text-slate-800 dark:text-white px-6">
      <title>{t("notFound.title")}</title>
      <meta name="robots" content="noindex, nofollow" />
      {/* Background Blobs (Light Mode) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none dark:hidden -z-10">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* Dark Mode Background */}
      <div className="fixed inset-0 hidden dark:block pointer-events-none -z-10 bg-[#0A0A0A]" />

      <div className="text-center max-w-md relative z-10">
        <p className="text-8xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-400 dark:from-white dark:to-white/40 mb-6">
          404
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">{t("notFound.title")}</h1>
        <p className="text-slate-500 dark:text-gray-400 mb-10 leading-relaxed">
          {t("notFound.description")}
        </p>
        <Link
          href={`/${locale}`}
          className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-indigo-600 dark:bg-emerald-600 text-white font-medium hover:opacity-90 transition-opacity shadow-lg"
        >
          {t("notFound.home")}
        </Link>
      </div>
    </div>
  )
}
