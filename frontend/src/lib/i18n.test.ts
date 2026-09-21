import { describe, expect, it } from "vitest"

import { getCompleteMessages, getRawMessages } from "@/lib/i18n-messages"
import { createTranslator, getLocaleDisplayName, type Messages } from "@/lib/i18n"

function leafKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === "string" ? [path] : leafKeys(value, path)
  })
}

describe("i18n messages", () => {
  it("localizes language names for cross-locale navigation", () => {
    expect(getLocaleDisplayName("zh", "en")).toBe("Chinese")
    expect(getLocaleDisplayName("en", "zh")).toBe("英文")
  })

  it("keeps English and Chinese catalogs structurally identical before fallback", () => {
    expect(leafKeys(getRawMessages("zh")).sort()).toEqual(leafKeys(getRawMessages("en")).sort())
    expect(getCompleteMessages("zh")).toBe(getRawMessages("zh"))
  })

  it("translates and interpolates from one selected locale", () => {
    const t = createTranslator(getCompleteMessages("zh"))

    expect(t("brand.name")).toBe("VibeDigest")
    expect(t("auth.signInFailed", { error: "timeout" })).toContain("timeout")
    expect(t("missing.key")).toBe("missing.key")
  })
})
