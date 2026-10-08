import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LandingFAQ } from "./LandingFAQ"

const copy: Record<string, string> = {
    "landing.faqTitle": "Questions before you begin?",
    "landing.faqSubtitle": "The essentials before you paste a link.",
    "landing.faqFreeQuestion": "Can I try VibeDigest for free?",
    "landing.faqFreeAnswer": "Yes. The {basicPlan} plan includes {basicQuota} videos each month and does not require a card.",
    "landing.faqSignInQuestion": "When do I need to sign in?",
    "landing.faqSignInAnswer": "Paste a supported link first.",
    "landing.faqBillingQuestion": "How is Pro billed?",
    "landing.faqBillingAnswer": "{proPlan} costs {monthlyPrice} monthly or {annualPrice} yearly.",
    "landing.contactSupport": "Contact support",
    "pricing.free.title": "Basic",
    "pricing.pro.title": "Pro",
}

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "en",
        t: (key: string, vars?: Record<string, string | number>) =>
            (copy[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`)),
    }),
}))

vi.mock("@/components/layout/FeedbackDialog", () => ({
    FeedbackDialog: ({ children, defaultCategory }: { children: ReactNode; defaultCategory: string }) => <div data-testid="support-dialog" data-category={defaultCategory}>{children}</div>,
}))

describe("LandingFAQ", () => {
    it("keeps the highest-friction answers on the landing page and keeps the support dialog entry", () => {
        render(<LandingFAQ />)

        expect(screen.getByText("Can I try VibeDigest for free?")).toBeInTheDocument()
        expect(screen.getByText("When do I need to sign in?")).toBeInTheDocument()
        expect(screen.getByText("How is Pro billed?")).toBeInTheDocument()
        expect(screen.getByText("Pro costs $9.99 monthly or $99 yearly.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Contact support" })).toBeInTheDocument()
        expect(screen.getByTestId("support-dialog")).toHaveAttribute("data-category", "support")
    })
})
