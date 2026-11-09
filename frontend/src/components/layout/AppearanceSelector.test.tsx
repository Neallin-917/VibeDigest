import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppearanceSelector } from "./AppearanceSelector"
import { renderToString } from "react-dom/server"
import { hydrateRoot, type Root } from "react-dom/client"
vi.mock("@/components/i18n/I18nProvider", () => ({ useI18n: () => ({ locale: "en" }) }))
describe("AppearanceSelector", () => {
    beforeEach(() => {
        localStorage.clear()
        document.documentElement.classList.remove("dark")
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    })
    afterEach(() => vi.unstubAllGlobals())
    it("preserves the system dark preference through server hydration without a saved choice", async () => {
        const media = vi.spyOn(window, "matchMedia").mockReturnValue({
            matches: true, media: "(prefers-color-scheme: dark)", onchange: null,
            addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        })
        // Match the document class applied by the locale layout's pre-paint script.
        document.documentElement.classList.add("dark")
        const container = document.createElement("div")
        container.innerHTML = renderToString(<AppearanceSelector />)
        document.body.appendChild(container)
        let root: Root | undefined
        const mutations: string[] = []
        const observer = new MutationObserver(records => records.forEach(record => mutations.push(record.oldValue ?? "")))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"], attributeOldValue: true })
        try {
            await act(async () => { root = hydrateRoot(container, <AppearanceSelector />) })
            expect(document.documentElement).toHaveClass("dark")
            expect(container.querySelector('[role="radio"][aria-checked="true"]')).toHaveAccessibleName("Dark")
            expect(localStorage.getItem("vibedigest:theme")).toBeNull()
            // A removal followed by restoration would leave an empty old class value.
            expect(mutations.every(value => value.split(" ").includes("dark"))).toBe(true)
        } finally {
            observer.disconnect()
            await act(async () => { root?.unmount() })
            container.remove()
            media.mockRestore()
        }
    })
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
