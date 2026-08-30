import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider, useI18n } from "./I18nProvider"

const navigation = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}))

function LocaleSwitch() {
  const { setLocale } = useI18n()
  return <button onClick={() => setLocale("zh")}>Switch language</button>
}

describe("I18nProvider", () => {
  beforeEach(() => {
    navigation.replace.mockReset()
    window.history.replaceState({}, "", "/en/chat?task=task-1#details")
    window.localStorage.clear()
    document.cookie = "vd_locale=; path=/; max-age=0"
  })

  it("switches locale with Next navigation while preserving the route state", () => {
    render(
      <I18nProvider locale="en" messages={{}}>
        <LocaleSwitch />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Switch language" }))

    expect(navigation.replace).toHaveBeenCalledWith("/zh/chat?task=task-1#details")
    expect(window.localStorage.getItem("vd.locale")).toBe("zh")
    expect(document.cookie).toContain("vd_locale=zh")
  })
})
