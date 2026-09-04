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
    locale: "en" as "en" | "zh",
    submit: undefined as ((text: string) => Promise<void | boolean>) | undefined,
    trackGrowthEvent: vi.fn(),
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

vi.mock("@/lib/growth-events", () => ({
    trackGrowthEvent: mocks.trackGrowthEvent,
}))

// Mock I18n
vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: mocks.locale,
        t: (key: string) => {
            if (key === "landing.smartSummarizationDesc") return "Analysis **with power**"
            if (key === "landing.trustedBy") return "Supports YouTube and podcasts"
            if (key === "landing.freeAllowance") return "3 summaries each month. No card required."
            if (key === "landing.signInHandoff") return "Sign in after submitting to begin."
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
        mocks.locale = "en"
        mocks.submit = undefined
        window.history.replaceState({}, "", "/en")
    })

    it("renders title strings", () => {
        render(<HeroSection />)
        expect(screen.getByText("landing.titlePrefix")).toBeInTheDocument()
        expect(screen.getByText("landing.titleEmphasis")).toBeInTheDocument()
        expect(screen.getByText("landing.previewTitle")).toBeInTheDocument()
    })

    it("does not render explanatory copy above the input", () => {
        render(<HeroSection />)
        expect(screen.queryByText(/Analysis/)).not.toBeInTheDocument()
    })

    it("renders ChatInput in inline mode", () => {
        render(<HeroSection />)
        const input = screen.getByTestId("chat-input")
        expect(input).toBeInTheDocument()
        expect(input).toHaveAttribute("data-variant", "inline")
        expect(input).toHaveAttribute("data-placeholder", "taskForm.urlPlaceholder")
        expect(input).toHaveAttribute("data-input-label", "taskForm.urlInputLabel")
    })

    it("keeps supporting copy out of the hero so the task input stays the only CTA", () => {
        render(<HeroSection />)

        expect(screen.queryByText("Supports YouTube and podcasts")).not.toBeInTheDocument()
        expect(screen.queryByText("3 summaries each month. No card required.")).not.toBeInTheDocument()
        expect(screen.queryByText("Sign in after submitting to begin.")).not.toBeInTheDocument()
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
        expect(mocks.trackGrowthEvent).toHaveBeenCalledWith("landing_agent_intent", {
            locale: "en",
            destination: "chat",
            source: "youtube",
        })
    })

    it("preserves the chat destination for a guest submission", async () => {
        mocks.locale = "zh"
        render(<HeroSection />)

        const originalUrl = "https://podcasts.apple.com/us/podcast/id123456?i=episode#notes"

        await act(async () => {
            await mocks.submit?.(originalUrl)
        })

        expect(localStorage.getItem("vibedigest_pending_message")).toBe(originalUrl)
        expect(mocks.push).toHaveBeenCalledWith(
            "/zh/login?next=%2Fzh%2Fchat",
        )
        expect(mocks.trackGrowthEvent).toHaveBeenCalledWith("landing_agent_intent", {
            locale: "zh",
            destination: "login",
            source: "apple_podcasts",
        })
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

    it("keeps unsupported input in place and does not report activation", async () => {
        render(<HeroSection />)

        let accepted: void | boolean | undefined
        await act(async () => {
            accepted = await mocks.submit?.("https://youtube.com")
        })

        expect(accepted).toBe(false)
        expect(screen.getByText("taskForm.urlHelp.title")).toBeInTheDocument()
        expect(localStorage.getItem("vibedigest_pending_message")).toBeNull()
        expect(mocks.trackGrowthEvent).not.toHaveBeenCalled()
        expect(mocks.push).not.toHaveBeenCalled()
    })
})
