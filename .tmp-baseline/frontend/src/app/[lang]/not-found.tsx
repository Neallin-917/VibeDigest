import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Page Not Found - VibeDigest",
  robots: { index: false, follow: false },
}

const CONTENT = {
  en: {
    code: "404",
    title: "Page Not Found",
    description:
      "The page you are looking for does not exist or has been moved.",
    cta: "Back to Home",
  },
  zh: {
    code: "404",
    title: "页面未找到",
    description: "您要访问的页面不存在或已被移动。",
    cta: "返回首页",
  },
  ja: {
    code: "404",
    title: "ページが見つかりません",
    description: "お探しのページは存在しないか、移動されました。",
    cta: "ホームに戻る",
  },
}

export default function NotFound() {
  // In Next.js not-found pages, we can't access params directly.
  // Fall back to English — the [lang]/layout.tsx still wraps this page with proper locale context.
  const t = CONTENT.en

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent text-slate-800 dark:text-white px-6">
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
          {t.code}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">{t.title}</h1>
        <p className="text-slate-500 dark:text-gray-400 mb-10 leading-relaxed">
          {t.description}
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-indigo-600 dark:bg-emerald-600 text-white font-medium hover:opacity-90 transition-opacity shadow-lg"
        >
          {t.cta}
        </Link>
      </div>
    </div>
  )
}
