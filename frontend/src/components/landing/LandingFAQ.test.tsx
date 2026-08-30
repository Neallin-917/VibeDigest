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
    "landing.faqBillingAnswer": "{proPlan} is {annualPrice} per year with a 12-month commitment.",
    "landing.faqLink": "Read the full FAQ",
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

describe("LandingFAQ", () => {
    it("keeps the highest-friction answers on the landing page and links to the canonical FAQ", () => {
        render(<LandingFAQ />)

        expect(screen.getByText("Can I try VibeDigest for free?")).toBeInTheDocument()
        expect(screen.getByText("When do I need to sign in?")).toBeInTheDocument()
        expect(screen.getByText("How is Pro billed?")).toBeInTheDocument()
        expect(screen.getByText("Pro is $99 per year with a 12-month commitment.")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Read the full FAQ" })).toHaveAttribute("href", "/en/faq")
    })
})
