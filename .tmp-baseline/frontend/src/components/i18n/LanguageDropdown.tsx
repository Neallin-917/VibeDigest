"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Check } from "lucide-react"

import { LOCALE_LABEL, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n"
import { useI18n } from "@/components/i18n/I18nProvider"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  align?: "left" | "right"
  size?: "sm" | "md"
}

export function LanguageDropdown({ className, align = "left", size = "md" }: Props) {
  const { locale, setLocale } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const currentLabel = useMemo(() => LOCALE_LABEL[locale], [locale])

  return (
    <div ref={rootRef} className={cn("relative z-30", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full rounded-md border text-left text-sm transition-all duration-200",
          "bg-white/50 backdrop-blur-md border-white/20 shadow-sm", // Light mode glass
          "dark:bg-white/10 dark:border-white/10", // Dark mode glass
          "hover:bg-white/80 dark:hover:bg-white/20", // Hover states
          "focus:outline-none focus:ring-2 focus:ring-primary/20",
          "flex items-center justify-between gap-2",
          size === "sm" ? "h-9 px-3" : "h-11 px-4"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate font-medium">{currentLabel}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border",
            "bg-white/75 backdrop-blur-2xl dark:bg-neutral-950/75", // Strong frosted glass
            "border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            align === "right" ? "right-0" : "left-0"
          )}
          role="listbox"
          aria-label="Language"
        >
          <div className="p-1.5 space-y-0.5">
            {SUPPORTED_LOCALES.map((l) => {
              const active = l === locale
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLocale(l as Locale)
                    setOpen(false)
                  }}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-9 pr-3 text-sm outline-none transition-colors",
                    "hover:bg-black/5 dark:hover:bg-white/10", // Subtle hover
                    active && "bg-black/5 dark:bg-white/10 font-medium text-primary" // Active state
                  )}
                  role="option"
                  aria-selected={active}
                >
                  <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
                    {active && <Check className="h-4 w-4" />}
                  </span>
                  <span className="truncate">{LOCALE_LABEL[l]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


