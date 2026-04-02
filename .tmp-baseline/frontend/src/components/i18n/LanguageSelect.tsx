"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { cn } from "@/lib/utils"
import { LanguageDropdown } from "@/components/i18n/LanguageDropdown"

export function LanguageSelect({ className }: { className?: string }) {
  const { t } = useI18n()

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium text-muted-foreground">{t("settings.language")}</div>
      <LanguageDropdown />
      <div className="text-[11px] text-muted-foreground">{t("settings.languageHint")}</div>
    </div>
  )
}


