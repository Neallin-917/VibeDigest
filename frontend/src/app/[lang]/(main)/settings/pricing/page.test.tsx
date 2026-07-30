import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import PricingPage from "./page"
import { ApiClient } from "@/lib/api"

const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockTranslate = (key: string) => key
const mockSupabase = {
    auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
    },
    from: vi.fn(() => ({ select: mockSelect })),
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

describe("PricingPage", () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
        render(<PricingPage />)

        expect(await screen.findByText("pricing.pro.subtitle")).toBeInTheDocument()
        expect(screen.getByText("pricing.active")).toBeInTheDocument()
        expect(screen.getByText("pricing.included")).toBeInTheDocument()
        expect(screen.queryByText("pricing.pro.annual")).not.toBeInTheDocument()
        expect(screen.queryByText("$8.33")).not.toBeInTheDocument()
        expect(mockSelect).toHaveBeenCalledTimes(1)
        expect(mockSelect).toHaveBeenCalledWith(
            "tier, usage_count, usage_limit, extra_credits",
        )
    })

    it("uses the customer portal API and shows an inline localized error", async () => {
        vi.mocked(ApiClient.createCustomerPortal).mockRejectedValue(
            new Error("Provider unavailable"),
        )
        vi.spyOn(console, "error").mockImplementation(() => {})
        render(<PricingPage />)

        fireEvent.click(await screen.findByText("pricing.pro.manage"))

        await waitFor(() => {
            expect(ApiClient.createCustomerPortal).toHaveBeenCalledWith("valid-token")
        })
        expect(await screen.findByRole("status")).toHaveTextContent(
            "pricing.portalError",
        )
    })
})
