import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PricingSection } from "./PricingSection"

const mockPush = vi.fn()
const mockGetUser = vi.fn()
const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/growth-events", () => growth)

vi.mock("@/lib/supabase", () => ({
    createClient: () => ({
        auth: {
            getUser: mockGetUser,
        },
    }),
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "en",
        t: (key: string, vars?: Record<string, string | number>) => {
            const translations: Record<string, string> = {
                "landing.simplePricing": "Simple Pricing",
                "landing.simplePricingSubtitle": "Choose the plan that fits your needs",
                "landing.getStarted": "Get started",
                "landing.mostPopular": "Most popular",
                "landing.viewPlan": "View plan",
                "landing.effectiveMonthly": "effective / month",
                "landing.proAnnualBilling": "{annualPrice} billed annually.",
                "pricing.free.title": "Basic",
                "pricing.free.desc": "Try VibeDigest",
                "pricing.pro.title": "Pro",
                "pricing.topup.title": "Top-up",
                "pricing.topup.desc": "Pay once",
                "pricing.topup.button": "Buy credits",
                "pricing.features.monthlyVideos": "{count} videos / month",
                "pricing.features.saveNotes": "Save notes",
                "pricing.features.multilingualSummaries": "Multilingual summaries",
                "pricing.features.everythingInBasic": "Everything in Basic",
                "pricing.features.topUpVideos": "{count} videos per pack",
                "pricing.features.neverExpires": "Never expires",
                "pricing.features.anyPlan": "Works with any plan",
            }

            return (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
        },
    }),
}))

function renderPricingSection() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })

    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        )
    }

    return render(<PricingSection />, { wrapper: Wrapper })
}

describe("PricingSection", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetUser.mockResolvedValue({
            data: { user: null },
            error: null,
        })
    })

    it("uses a plan-neutral Pro action for both visitors and existing subscribers", () => {
        renderPricingSection()

        expect(screen.getByRole("button", { name: "View plan" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Upgrade" })).not.toBeInTheDocument()
        expect(screen.getByText("$8.25")).toBeInTheDocument()
        expect(screen.getByText("$5.00")).toBeInTheDocument()
        expect(screen.queryByText("$4.99")).not.toBeInTheDocument()
    })

    it("reuses the landing account lookup across plan actions", async () => {
        const user = userEvent.setup()
        renderPricingSection()

        await waitFor(() => expect(mockGetUser).toHaveBeenCalledTimes(1))

        await user.click(screen.getByRole("button", { name: "View plan" }))
        await user.click(screen.getByRole("button", { name: "Buy credits" }))

        expect(mockGetUser).toHaveBeenCalledTimes(1)
        expect(mockPush).toHaveBeenNthCalledWith(1, "/en/login?next=%2Fen%2Fsettings%2Fpricing%23pro")
        expect(mockPush).toHaveBeenNthCalledWith(2, "/en/login?next=%2Fen%2Fsettings%2Fpricing%23topup")
    })

    it.each([
        { name: "View plan", plan: "pro", next: "/en/settings/pricing#pro" },
        { name: "Get started", plan: "free", next: "/en/chat" },
        { name: "Buy credits", plan: "topup", next: "/en/settings/pricing#topup" },
    ] as const)("tracks pricing_plan_open for %s before sending visitors to login", async ({ name, plan, next }) => {
        const user = userEvent.setup()
        renderPricingSection()

        await waitFor(() => expect(mockGetUser).toHaveBeenCalledTimes(1))
        await user.click(screen.getByRole("button", { name }))

        expect(growth.trackGrowthEvent).toHaveBeenCalledWith("pricing_plan_open", {
            locale: "en",
            plan,
            destination: "login",
        })
        expect(mockPush).toHaveBeenCalledWith(`/en/login?next=${encodeURIComponent(next)}`)
    })

    it.each([
        { name: "View plan", plan: "pro", destination: "pricing", path: "/en/settings/pricing#pro" },
        { name: "Get started", plan: "free", destination: "chat", path: "/en/chat" },
        { name: "Buy credits", plan: "topup", destination: "pricing", path: "/en/settings/pricing#topup" },
    ] as const)("preserves a signed-in visitor's $plan intent", async ({ name, plan, destination, path }) => {
        const user = userEvent.setup()
        mockGetUser.mockResolvedValue({
            data: { user: { id: "user-1", email: "user@example.com" } },
            error: null,
        })
        renderPricingSection()

        await waitFor(() => expect(mockGetUser).toHaveBeenCalledTimes(1))
        await user.click(screen.getByRole("button", { name }))

        expect(growth.trackGrowthEvent).toHaveBeenCalledWith("pricing_plan_open", {
            locale: "en",
            plan,
            destination,
        })
        expect(mockPush).toHaveBeenCalledWith(path)
    })
})
