import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const routerBack = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: routerBack }),
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => ({
      "auth.welcomeBack": "登录",
      "common.close": "关闭",
    })[key] ?? key,
  }),
}))

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => <div>login form</div>,
}))

import LoginModal from "./page"

describe("localized login modal", () => {
  it("uses the Chinese translation as its accessible dialog title", () => {
    render(<LoginModal />)

    expect(screen.getByRole("dialog", { name: "登录" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument()
  })
})
