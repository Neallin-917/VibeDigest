import { render, screen } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"
import { HeroSection } from "./HeroSection"

// Mock next/navigation
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: vi.fn(),
}))

// Mock I18n
vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        t: (key: string) => {
            if (key === "landing.smartSummarizationDesc") return "Analysis **with power**"
            return key
        }
    })
}))

// Mock ChatInput
vi.mock("@/components/chat/ChatInput", () => ({
    ChatInput: ({ variant }: any) => <div data-testid="chat-input" data-variant={variant}>ChatInput</div>
}))

describe("HeroSection", () => {
    it("renders title strings", () => {
        render(<HeroSection />)
        expect(screen.getByText("landing.titlePrefix")).toBeInTheDocument()
        expect(screen.getByText("landing.titleEmphasis")).toBeInTheDocument()
    })

    it("renders parsed markdown in description", () => {
        render(<HeroSection />)
        // Should have "with power" in bold
        const bold = screen.getByText("with power")
        expect(bold.tagName).toBe("SPAN")
        expect(bold.className).toContain("font-semibold")
    })

    it("renders ChatInput in inline mode", () => {
        render(<HeroSection />)
        const input = screen.getByTestId("chat-input")
        expect(input).toBeInTheDocument()
        expect(input).toHaveAttribute("data-variant", "inline")
    })
})
