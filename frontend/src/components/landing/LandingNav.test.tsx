import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { LandingNav } from "./LandingNav"

// Mocks
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
    usePathname: vi.fn(),
}))
import { usePathname } from "next/navigation"

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "en",
        t: (k: string) => {
            const translations: Record<string, string> = {
                "landing.navProduct": "Product",
                "landing.navDemos": "Demos",
                "landing.navFeatures": "Features",
                "landing.navHowItWorks": "How It Works",
                "landing.navPricing": "Pricing",
                "landing.navFAQ": "FAQ",
                "landing.language": "Language",
                "landing.theme": "Theme",
                "auth.goToDashboard": "Go to Dashboard"
            }
            return translations[k] || k
        }
    })
}))

vi.mock("@/components/auth/LandingUserButton", () => ({
    LandingUserButton: () => <button>UserButton</button>
}))
vi.mock("@/components/i18n/LanguageInlineSelect", () => ({
    LanguageInlineSelect: () => <button>LangSelect</button>
}))
vi.mock("@/components/layout/BrandLogo", () => ({
    BrandLogo: () => <span>Logo</span>
}))
vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
}))

describe("LandingNav", () => {
    beforeEach(() => {
        vi.clearAllMocks()
            ; (usePathname as any).mockReturnValue("/en")
        Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true })
    })

    it("renders core elements", () => {
        render(<LandingNav />)
        expect(screen.getByText("Logo")).toBeInTheDocument()
        expect(screen.getAllByText("Demos").length).toBeGreaterThan(0)
        expect(screen.getAllByText("Features").length).toBeGreaterThan(0)
        expect(screen.getAllByText("UserButton")[0]).toBeInTheDocument()
    })

    it("renders correct links with locale", () => {
        render(<LandingNav />)

        const logoLink = screen.getByText("Logo").closest("a")
        expect(logoLink).toHaveAttribute("href", "/en#hero")

        const libraryLinks = screen.getAllByText("Demos").map((node) => node.closest("a"))
        expect(libraryLinks.length).toBeGreaterThan(0)
        libraryLinks.forEach((link) => expect(link).toHaveAttribute("href", "/en/explore"))
    })

    it("renders router links correctly", () => {
        render(<LandingNav />)
        const faqLink = screen.getAllByText("FAQ")[0].closest("a")
        expect(faqLink).toHaveAttribute("href", "/en/faq")
    })

    it("uses a fine underline for desktop navigation feedback", () => {
        render(<LandingNav />)

        const libraryLink = screen.getAllByText("Demos")[0].closest("a")
        expect(libraryLink).toHaveClass(
            "after:scale-x-0",
            "hover:after:scale-x-100",
            "focus-visible:after:scale-x-100",
            "after:duration-200"
        )
        expect(libraryLink).not.toHaveClass("hover:bg-slate-100")
    })

    it("marks the shared library navigation item as current on the explore route", () => {
        ; (usePathname as any).mockReturnValue("/en/explore")
        render(<LandingNav />)

        const currentLinks = screen.getAllByText("Demos").map((node) => node.closest("a"))
        currentLinks.forEach((link) => expect(link).toHaveAttribute("aria-current", "page"))
        expect(currentLinks[0]).toHaveClass("after:scale-x-100", "text-slate-950")
    })

    it("adds a readable navigation surface after scrolling", () => {
        render(<LandingNav />)
        Object.defineProperty(window, "scrollY", { value: 100, writable: true, configurable: true })
        fireEvent.scroll(window)

        const navSurface = screen.getByRole("navigation").firstElementChild
        expect(navSurface).toHaveAttribute("data-scrolled", "true")
        expect(navSurface).toHaveClass("bg-white/90", "backdrop-blur-xl")
    })
})
