import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppearanceSelector } from "./AppearanceSelector"
vi.mock("@/components/i18n/I18nProvider", () => ({ useI18n: () => ({ locale: "en" }) }))
describe("AppearanceSelector", () => {
    beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove("dark") })
    it("persists appearance and supports radio keyboard navigation", () => {
        const { container } = render(<AppearanceSelector />)
        container.querySelector("details")!.open = true
        fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
        expect(document.documentElement).toHaveClass("dark")
        expect(localStorage.getItem("vibedigest:theme")).toBe("dark")
        fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowLeft" })
        expect(document.documentElement).not.toHaveClass("dark")
        expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true")
        fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "Escape" })
        expect(container.querySelector("details")).not.toHaveAttribute("open")
        expect(container.querySelector("summary")).toHaveFocus()
    })
    it("restores a saved preference and closes on outside interaction", () => {
        localStorage.setItem("vibedigest:theme", "dark")
        const { container } = render(<AppearanceSelector />)
        expect(document.documentElement).toHaveClass("dark")
        container.querySelector("details")!.open = true
        fireEvent.pointerDown(document.body)
        expect(container.querySelector("details")).not.toHaveAttribute("open")
    })
})
