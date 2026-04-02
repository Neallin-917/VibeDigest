"use client"

import { useEffect } from "react"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("[ErrorBoundary]", error)
  }, [error])

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
        <p className="text-7xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-red-600 to-red-300 dark:from-red-400 dark:to-red-200 mb-6">
          Oops
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">
          Something went wrong
        </h1>
        <p className="text-slate-500 dark:text-gray-400 mb-10 leading-relaxed">
          An unexpected error occurred. Please try again or go back to the home
          page.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-indigo-600 dark:bg-emerald-600 text-white font-medium hover:opacity-90 transition-opacity shadow-lg"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-medium hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
