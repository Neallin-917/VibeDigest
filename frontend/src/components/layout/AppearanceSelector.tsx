"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { SunMoon } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { ThemeSelector } from "@/components/ui/rare/theme-selector"

const eventName = "vibedigest:appearance"
const storageKey = "vibedigest:theme"
function readTheme() {
    try {
        const saved = localStorage.getItem(storageKey)
        if (saved === "light" || saved === "dark") return saved
    } catch { /* Appearance still works when storage is unavailable. */ }
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
}
function subscribe(callback: () => void) {
    window.addEventListener(eventName, callback)
    window.addEventListener("storage", callback)
    return () => {
        window.removeEventListener(eventName, callback)
        window.removeEventListener("storage", callback)
    }
}
export function AppearanceSelector() {
    const { locale } = useI18n()
    const theme = useSyncExternalStore(subscribe, readTheme, () => "light")
    const ref = useRef<HTMLDetailsElement>(null)
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
    }, [theme])
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false
        }
        document.addEventListener("pointerdown", close)
        return () => document.removeEventListener("pointerdown", close)
    }, [])
    const zh = locale === "zh"
    return (
        <details ref={ref} className="relative" onKeyDown={event => {
            if (event.key === "Escape" && ref.current) {
                ref.current.open = false
                ref.current.querySelector("summary")?.focus()
            }
        }}>
            <summary aria-label={zh ? "切换明暗外观" : "Change appearance"} className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <SunMoon className="size-4" aria-hidden="true" />
            </summary>
            <div className="appearance-panel absolute -right-16 top-full z-[60] mt-2 w-[276px] rounded-2xl border border-border bg-popover p-5 shadow-xl sm:right-0">
                <ThemeSelector aria-label={zh ? "外观" : "Appearance"} value={theme} onChange={value => {
                    document.documentElement.classList.toggle("dark", value === "dark")
                    try { localStorage.setItem(storageKey, value) } catch { /* No persistence available. */ }
                    window.dispatchEvent(new Event(eventName))
                }} itemClassName="w-28" themes={[
                    { value: "light", label: zh ? "浅色" : "Light", colors: { sidebar: "#e7ebe3", panel: "#fbfaf5", border: "#d3d7cd", strong: "#466c50", muted: "#d3d7cd", tile: "#f3f1ea" } },
                    { value: "dark", label: zh ? "深色" : "Dark", colors: { sidebar: "#2d382e", panel: "#191e1a", border: "#404c40", strong: "#abc6a3", muted: "#404c40", tile: "#222923" } },
                ]} />
            </div>
        </details>
    )
}
