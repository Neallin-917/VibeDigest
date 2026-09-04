import { describe, expect, it, vi } from "vitest"

const requestState = vi.hoisted(() => ({ locale: null as string | null }))

vi.mock("next/headers", () => ({
  headers: async () => new Headers(
    requestState.locale ? { "x-vd-locale": requestState.locale } : undefined,
  ),
}))

import RootLayout from "./layout"

describe("root layout document language", () => {
  it.each(["en", "zh", "ja"])("renders %s into the server document", async (locale) => {
    requestState.locale = locale

    const layout = await RootLayout({ children: "content", auth: "auth" })

    expect(layout.props.lang).toBe(locale)
  })

  it("uses English when the internal locale header is absent or unsupported", async () => {
    requestState.locale = "fr"
    const unsupported = await RootLayout({ children: "content", auth: "auth" })
    requestState.locale = null
    const absent = await RootLayout({ children: "content", auth: "auth" })

    expect(unsupported.props.lang).toBe("en")
    expect(absent.props.lang).toBe("en")
  })
})
