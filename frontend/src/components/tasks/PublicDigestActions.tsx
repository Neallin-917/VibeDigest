"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import { trackGrowthEvent } from "@/lib/growth-events"

export function PublicDigestActions({
  canonicalUrl,
  locale,
  source,
  copy,
}: {
  canonicalUrl: string
  locale: Locale
  source: string
  copy: { share: string; copied: string; copyFailed: string }
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    trackGrowthEvent("public_digest_view", { locale, source })
  }, [locale, source])

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(canonicalUrl)
      setStatus("copied")
      trackGrowthEvent("public_digest_share", { locale, source, method: "copy_link" })
    } catch {
      setStatus("failed")
    }

    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setStatus("idle"), 2000)
  }

  const label = status === "copied" ? copy.copied : status === "failed" ? copy.copyFailed : copy.share

  return (
    <button
      type="button"
      onClick={copyShareLink}
      className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
      aria-live="polite"
    >
      {status === "copied"
        ? <Check className="size-4" aria-hidden="true" />
        : <Copy className="size-4" aria-hidden="true" />}
      {label}
    </button>
  )
}
