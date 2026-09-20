import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UsageCard, type UsageProfile } from "./UsageCard"

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({ locale: "en", t: (key: string, vars?: Record<string, string>) => vars?.date ? `${key}: ${vars.date}` : key }),
}))
const profile: UsageProfile = { tier: "pro", usage_count: 4, usage_limit: 100, extra_credits: 7, period_end: "2027-01-10T12:00:00Z" }

describe("UsageCard subscription details", () => {
    it.each([
        [true, "pricing.endsOn"],
        [false, "pricing.renewsOn"],
        [null, "pricing.validUntil"],
    ] as const)("uses the explicit cancellation state %s", (cancel, label) => {
        render(<UsageCard profile={{ ...profile, billing_interval: "annual", cancel_at_period_end: cancel }} />)
        expect(screen.getByText("pricing.pro.annual")).toBeInTheDocument()
        expect(screen.getByText(`${label}: Jan 10, 2027`)).toBeInTheDocument()
    })
    it("does not infer billing or renewal for a legacy account", () => {
        render(<UsageCard profile={profile} />)
        expect(screen.getByText("pricing.validUntil: Jan 10, 2027")).toBeInTheDocument()
        expect(screen.queryByText("pricing.pro.annual")).not.toBeInTheDocument()
        expect(screen.queryByText("pricing.pro.monthly")).not.toBeInTheDocument()
    })
    it("does not show stale subscription fields on Basic", () => {
        render(<UsageCard profile={{ ...profile, tier: "free", billing_interval: "monthly", cancel_at_period_end: false }} />)
        expect(screen.getByText("pricing.free.title")).toBeInTheDocument()
        expect(screen.queryByText(/pricing.renewsOn/)).not.toBeInTheDocument()
        expect(screen.queryByText("pricing.pro.monthly")).not.toBeInTheDocument()
    })
})
