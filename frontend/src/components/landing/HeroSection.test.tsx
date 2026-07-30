import { act, render, screen } from "@testing-library/react"
import { beforeEach, vi, describe, it, expect } from "vitest"
import { HeroSection } from "./HeroSection"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    refetch: vi.fn(),
    account: {
        data: null as { id: string } | null | undefined,
        isPending: false,
    },
    submit: undefined as ((text: string) => Promise<void>) | undefined,
}))

// Mock next/navigation
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
    usePathname: vi.fn(),
}))

vi.mock("@/hooks/useAccountQueries", () => ({
    useCurrentUserQuery: () => ({
        ...mocks.account,
        refetch: mocks.refetch,
    }),
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
    ChatInput: ({ variant, placeholder, inputLabel, onSubmit }: any) => {
        mocks.submit = onSubmit
        return (
            <div
                data-testid="chat-input"
                data-variant={variant}
                data-placeholder={placeholder}
                data-input-label={inputLabel}
            >
                ChatInput
            </div>
        )
    },
}))

describe("HeroSection", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        mocks.account.data = null
        mocks.account.isPending = false
        mocks.submit = undefined
        window.history.replaceState({}, "", "/en")
    })

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
        expect(input).toHaveAttribute("data-placeholder", "taskForm.urlPlaceholder")
        expect(input).toHaveAttribute("data-input-label", "taskForm.urlInputLabel")
    })

    it("uses the shared account cache for an authenticated submission", async () => {
        mocks.account.data = { id: "user-1" }
        render(<HeroSection />)

        await act(async () => {
            await mocks.submit?.("https://www.youtube.com/watch?v=test123")
        })

        expect(mocks.refetch).not.toHaveBeenCalled()
        expect(localStorage.getItem("vibedigest_pending_message"))
            .toBe("https://www.youtube.com/watch?v=test123")
        expect(mocks.push).toHaveBeenCalledWith("/en/chat")
    })

    it("preserves the chat destination for a guest submission", async () => {
        render(<HeroSection />)

        await act(async () => {
            await mocks.submit?.("https://www.youtube.com/watch?v=test123")
        })

        expect(mocks.push).toHaveBeenCalledWith(
            "/en/login?next=%2Fen%2Fchat",
        )
    })

    it("resolves an unknown account once before routing", async () => {
        mocks.account.data = undefined
        mocks.account.isPending = true
        mocks.refetch.mockResolvedValue({ data: { id: "user-1" } })
        render(<HeroSection />)

        await act(async () => {
            await mocks.submit?.("https://www.youtube.com/watch?v=test123")
        })

        expect(mocks.refetch).toHaveBeenCalledTimes(1)
        expect(mocks.push).toHaveBeenCalledWith("/en/chat")
    })
})
