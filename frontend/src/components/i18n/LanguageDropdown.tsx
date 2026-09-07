"use client"

import { getLocaleDisplayName, isLocale, SUPPORTED_LOCALES } from "@/lib/i18n"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  align?: "left" | "right"
  size?: "sm" | "md"
}

export function LanguageDropdown({ className, align = "left", size = "md" }: Props) {
  const { locale, setLocale, t } = useI18n()
  const languageLabel = t("common.language")

  return (
    <div className={className}>
      <Select value={locale} onValueChange={(value) => {
        if (isLocale(value)) setLocale(value)
      }}>
        <SelectTrigger
          aria-label={languageLabel}
          className={cn(
            "w-full border-border bg-card text-left font-medium hover:bg-surface",
            size === "sm" ? "data-[size=default]:h-9 px-3" : "data-[size=default]:h-11 px-4"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align={align === "right" ? "end" : "start"} aria-label={languageLabel}>
          {SUPPORTED_LOCALES.map((value) => (
            <SelectItem key={value} value={value} className="min-h-11">
              {getLocaleDisplayName(value, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
