import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import PricingPage from "./page"
import { ApiClient } from "@/lib/api"
import { customerPlanCatalog } from "@/lib/billing/plan-catalog"

const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockTranslate = (key: string) => key
const mockAssign = vi.fn()
const growth = vi.hoisted(() => ({ trackGrowthEvent: vi.fn() }))
const mockSupabase = {
    auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
    },
    from: vi.fn(() => ({ select: mockSelect })),
}

function renderPricingPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
        },
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <PricingPage />
        </QueryClientProvider>,
    )
}

vi.mock("@/lib/supabase", () => ({
    createClient: () => mockSupabase,
}))

vi.mock("@/lib/api", () => ({
    ApiClient: {
        createCustomerPortal: vi.fn(),
        createCheckoutSession: vi.fn(),
        createCryptoCharge: vi.fn(),
    },
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "zh",
        t: mockTranslate,
    }),
}))

vi.mock("@/lib/growth-events", () => growth)

describe("PricingPage", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(window, "location", {
            value: { ...window.location, assign: mockAssign },
            writable: true,
        })
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
        mockGetSession.mockResolvedValue({
            data: { session: { access_token: "valid-token" } },
        })
        mockSingle.mockResolvedValue({
            data: {
                tier: "pro",
                usage_count: 10,
                usage_limit: 100,
                extra_credits: 5,
            },
            error: null,
        })
    })

    it("shows a consistent Pro state from one profile request", async () => {
        renderPricingPage()

        expect(await screen.findByText("pricing.pro.subtitle")).toBeInTheDocument()
        expect(screen.getByText("pricing.active")).toBeInTheDocument()
        expect(screen.getByText("pricing.included")).toBeInTheDocument()
        expect(screen.queryByText("pricing.pro.annual")).not.toBeInTheDocument()
        expect(screen.queryByText("$8.33")).not.toBeInTheDocument()
        expect(mockSelect).toHaveBeenCalledTimes(1)
        expect(mockSelect).toHaveBeenCalledWith(
            "tier, usage_count, usage_limit, extra_credits",
        )
        expect(document.querySelector("#pro")).toBeInTheDocument()
        expect(document.querySelector("#topup")).toBeInTheDocument()
    })

    it("uses the customer portal API and shows an inline localized error", async () => {
        vi.mocked(ApiClient.createCustomerPortal).mockRejectedValue(
            new Error("Provider unavailable"),
        )
        vi.spyOn(console, "error").mockImplementation(() => {})
        renderPricingPage()

        fireEvent.click(await screen.findByText("pricing.pro.manage"))

        await waitFor(() => {
            expect(ApiClient.createCustomerPortal).toHaveBeenCalledWith("valid-token")
        })
        expect(await screen.findByRole("status")).toHaveTextContent(
            "pricing.portalError",
        )
    })

    it("explains when a Pro plan has no online subscription", async () => {
        vi.mocked(ApiClient.createCustomerPortal).mockResolvedValue({
            url: null,
            available: false,
        })
        renderPricingPage()

        fireEvent.click(await screen.findByText("pricing.pro.manage"))

        expect(await screen.findByRole("status")).toHaveTextContent(
            "pricing.portalUnavailable",
        )
    })

    it("tracks a Pro annual checkout redirect only after a real checkout URL is returned", async () => {
        mockSingle.mockResolvedValue({
            data: {
                tier: "free",
                usage_count: 0,
                usage_limit: 3,
                extra_credits: 0,
            },
            error: null,
        })
        vi.mocked(ApiClient.createCheckoutSession).mockResolvedValue({
            url: "https://checkout.example/pro-annual",
        })
        renderPricingPage()

        fireEvent.click(await screen.findByText("pricing.pro.button"))

        await waitFor(() => {
            expect(ApiClient.createCheckoutSession).toHaveBeenCalledWith(
                customerPlanCatalog.plans.pro.billingOptions.annual.planKey,
                "valid-token",
            )
        })
        expect(growth.trackGrowthEvent).toHaveBeenCalledWith("pricing_checkout_redirect", {
            locale: "zh",
            product: "pro",
            billing: "annual",
        })
        expect(mockAssign).toHaveBeenCalledWith("https://checkout.example/pro-annual")
    })

    it("tracks the monthly Pro checkout mapping when annual billing is turned off", async () => {
        mockSingle.mockResolvedValue({
            data: {
                tier: "free",
                usage_count: 0,
                usage_limit: 3,
                extra_credits: 0,
            },
            error: null,
        })
        vi.mocked(ApiClient.createCheckoutSession).mockResolvedValue({
            url: "https://checkout.example/pro-monthly",
        })
        renderPricingPage()

        fireEvent.click(await screen.findByRole("switch"))
        fireEvent.click(screen.getByText("pricing.pro.button"))

        await waitFor(() => {
            expect(ApiClient.createCheckoutSession).toHaveBeenCalledWith(
                customerPlanCatalog.plans.pro.billingOptions.monthly.planKey,
                "valid-token",
            )
        })
        expect(growth.trackGrowthEvent).toHaveBeenCalledWith("pricing_checkout_redirect", {
            locale: "zh",
            product: "pro",
            billing: "monthly",
        })
        expect(mockAssign).toHaveBeenCalledWith("https://checkout.example/pro-monthly")
    })

    it("tracks the one-time top-up checkout mapping", async () => {
        vi.mocked(ApiClient.createCheckoutSession).mockResolvedValue({
            url: "https://checkout.example/topup",
        })
        renderPricingPage()

        const button = await screen.findByRole("button", { name: "pricing.topup.button" })
        await waitFor(() => expect(button).toBeEnabled())
        fireEvent.click(button)

        await waitFor(() => {
            expect(ApiClient.createCheckoutSession).toHaveBeenCalledWith(
                customerPlanCatalog.topUps.videoCredits.planKey,
                "valid-token",
            )
        })
        expect(growth.trackGrowthEvent).toHaveBeenCalledWith("pricing_checkout_redirect", {
            locale: "zh",
            product: "topup",
            billing: "one_time",
        })
        expect(mockAssign).toHaveBeenCalledWith("https://checkout.example/topup")
    })

    it("does not track a checkout redirect when the checkout API returns an empty URL", async () => {
        mockSingle.mockResolvedValue({
            data: {
                tier: "free",
                usage_count: 0,
                usage_limit: 3,
                extra_credits: 0,
            },
            error: null,
        })
        vi.spyOn(console, "error").mockImplementation(() => {})
        vi.mocked(ApiClient.createCheckoutSession).mockResolvedValue({
            url: "",
        })
        renderPricingPage()

        fireEvent.click(await screen.findByText("pricing.pro.button"))

        expect(await screen.findByRole("status")).toHaveTextContent("pricing.checkoutError")
        expect(growth.trackGrowthEvent).not.toHaveBeenCalledWith("pricing_checkout_redirect", expect.anything())
        expect(mockAssign).not.toHaveBeenCalled()
    })
})
