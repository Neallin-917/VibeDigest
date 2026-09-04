import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const requestState = vi.hoisted(() => ({ locale: "en" }))

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vd-locale": requestState.locale }),
}))

import GlobalNotFound, { generateMetadata } from "./global-not-found"

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textContent).join(" ")
  if (node && typeof node === "object" && "props" in node) {
    return textContent((node as { props: { children?: ReactNode } }).props.children)
  }
  return ""
}

describe("global localized not found page", () => {
  it.each([
    { locale: "en", title: "Page not found", description: "The page you requested does not exist." },
    { locale: "zh", title: "页面不存在", description: "你访问的页面不存在。" },
    { locale: "ja", title: "ページが見つかりません", description: "アクセスしたページは存在しないか、移動されました。" },
  ])("renders a complete $locale document", async ({ locale, title, description }) => {
    requestState.locale = locale

    const document = await GlobalNotFound()
    const metadata = await generateMetadata()

    expect(document.type).toBe("html")
    expect(document.props.lang).toBe(locale)
    expect(textContent(document)).toContain(title)
    expect(textContent(document)).toContain(description)
    expect(metadata.title).toBe(title)
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("falls back to English when the internal locale is invalid", async () => {
    requestState.locale = "fr"

    const document = await GlobalNotFound()

    expect(document.props.lang).toBe("en")
    expect(textContent(document)).toContain("Page not found")
  })
})
