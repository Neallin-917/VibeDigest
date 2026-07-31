import { describe, expect, it } from "vitest"

import { getCompleteMessages } from "@/lib/i18n-messages"
import { createTranslator, type Messages } from "@/lib/i18n"

function leafKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === "string" ? [path] : leafKeys(value, path)
  })
}

describe("i18n messages", () => {
  it("keeps every locale structurally complete", () => {
    const englishKeys = leafKeys(getCompleteMessages("en")).sort()

    for (const locale of ["zh", "ja"] as const) {
      const localeKeys = new Set(leafKeys(getCompleteMessages(locale)))
      const missingKeys = englishKeys.filter((key) => !localeKeys.has(key))
      expect(missingKeys, `${locale} is missing English fallback keys`).toEqual([])
    }
  })

  it("translates and interpolates from one selected locale", () => {
    const t = createTranslator(getCompleteMessages("zh"))

    expect(t("brand.name")).toBe("VibeDigest")
    expect(t("auth.signInFailed", { error: "timeout" })).toContain("timeout")
    expect(t("missing.key")).toBe("missing.key")
  })
})
