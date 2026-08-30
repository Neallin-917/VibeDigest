import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MainShell } from "./MainShell"

const shellState = vi.hoisted(() => ({
    pathname: "/en/chat",
    replace: vi.fn(),
    user: { id: "user-1" } as { id: string } | null,
    isLoading: false,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: shellState.replace }),
    usePathname: () => shellState.pathname,
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({ locale: "en", t: (key: string) => key }),
}))

vi.mock("@/hooks/useAccountQueries", () => ({
    useCurrentUserQuery: () => ({
        data: shellState.user,
        isLoading: shellState.isLoading,
    }),
}))

vi.mock("@/components/layout/AppSidebarContext", () => ({
    AppSidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/layout/AppSidebar", () => ({
    AppSidebar: () => <aside data-testid="app-sidebar">sidebar</aside>,
}))

vi.mock("@/components/layout/MobileNav", () => ({
    MobileHeader: () => <div data-testid="mobile-header">header</div>,
    MobileBottomNav: () => <div data-testid="mobile-bottom-nav">footer</div>,
}))

vi.mock("@/components/auth/LandingUserButton", () => ({
    LandingUserButton: () => <button type="button">User</button>,
}))

vi.mock("@/components/i18n/LanguageInlineSelect", () => ({
    LanguageInlineSelect: () => <button type="button">Language</button>,
}))

vi.mock("@/components/layout/BrandLogo", () => ({
    BrandLogo: () => <span>Logo</span>,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/tasks/TaskNotificationListener", () => ({
    TaskNotificationListener: () => <div data-testid="task-notifications">notifications</div>,
}))

describe("MainShell", () => {
    beforeEach(() => {
        shellState.pathname = "/en/chat"
        shellState.user = { id: "user-1" }
        shellState.isLoading = false
        shellState.replace.mockReset()
    })

    it("keeps public task detail pages outside the authenticated app shell", () => {
        shellState.pathname = "/en/tasks/task-1/example"

        render(<MainShell><div>Public task detail</div></MainShell>)

        expect(screen.getByText("Public task detail")).toBeInTheDocument()
        expect(document.querySelector('[data-slot="task-detail-nav-scrim"]')).toBeInTheDocument()
        expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument()
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument()
    })

    it("renders the authenticated app shell for protected product routes", () => {
        render(<MainShell><div>Chat workspace</div></MainShell>)

        expect(screen.getByTestId("app-sidebar")).toBeInTheDocument()
        expect(screen.getByTestId("mobile-header")).toBeInTheDocument()
        expect(screen.getByTestId("mobile-bottom-nav")).toBeInTheDocument()
        expect(screen.getByText("Chat workspace")).toBeInTheDocument()
    })
})
