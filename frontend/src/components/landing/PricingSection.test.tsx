import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PricingSection } from "./PricingSection"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/supabase", () => ({
    createClient: () => ({
        auth: {
            getUser: vi.fn(),
        },
    }),
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "en",
        t: (key: string) => {
            const translations: Record<string, string> = {
                "landing.simplePricing": "Simple Pricing",
                "landing.simplePricingSubtitle": "Choose the plan that fits your needs",
                "landing.getStarted": "Get started",
                "landing.mostPopular": "Most popular",
                "landing.viewPlan": "View plan",
                "pricing.free.title": "Free",
                "pricing.free.price": "$0",
                "pricing.free.desc": "Try VibeDigest",
                "pricing.free.features.f1": "3 videos",
                "pricing.free.features.f4": "Save notes",
                "pricing.free.features.f5": "Translate transcripts",
                "pricing.pro.title": "Pro",
                "pricing.pro.price": "$9.99",
                "pricing.pro.unit": "/ month",
                "pricing.pro.desc": "For frequent use",
                "pricing.pro.features.f1": "100 videos",
                "pricing.pro.features.f2": "Everything in Free",
                "pricing.topup.title": "Top-up",
                "pricing.topup.price": "$4.99",
                "pricing.topup.desc": "Pay once",
                "pricing.topup.features.f1": "50 videos",
                "pricing.topup.features.f2": "Never expires",
                "pricing.topup.features.f3": "Works with any plan",
                "pricing.topup.button": "Buy credits",
            }

            return translations[key] ?? key
        },
    }),
}))

describe("PricingSection", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("uses a plan-neutral Pro action for both visitors and existing subscribers", () => {
        render(<PricingSection />)

        expect(screen.getByRole("button", { name: "View plan" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Upgrade" })).not.toBeInTheDocument()
    })
})
