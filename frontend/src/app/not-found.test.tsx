import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const requestState = vi.hoisted(() => ({ locale: null as string | null }))

vi.mock("next/headers", () => ({
  headers: async () => new Headers(
    requestState.locale ? { "x-vd-locale": requestState.locale } : undefined,
  ),
}))

import RootNotFound from "./not-found"

describe("root not-found", () => {
  it("uses the internal request locale for Chinese copy and navigation", async () => {
    requestState.locale = "zh"

    render(await RootNotFound())

    expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument()
    expect(screen.getByText("你访问的页面不存在。")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/zh")
  })

  it("uses English for an unsupported locale", async () => {
    requestState.locale = "fr"

    render(await RootNotFound())

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/en")
  })
})
