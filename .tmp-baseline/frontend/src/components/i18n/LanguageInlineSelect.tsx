"use client"

import { LanguageDropdown } from "@/components/i18n/LanguageDropdown"

export function LanguageInlineSelect({ className }: { className?: string }) {
  return <LanguageDropdown className={className} align="right" size="sm" />
}


