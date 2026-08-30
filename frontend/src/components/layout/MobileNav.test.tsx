import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MobileHeader } from "./MobileNav"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
  errorToast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/chat",
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: mocks.setQueryData,
    removeQueries: mocks.removeQueries,
  }),
}))

vi.mock("sonner", () => ({
  toast: { error: mocks.errorToast },
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
  useI18n: () => ({ locale: "en", t: (key: string) => key }),
}))

vi.mock("@/hooks/useAccountQueries", () => ({
  accountKeys: {
    currentUser: ["account", "current-user"],
    profiles: ["account", "profile"],
  },
  useCurrentUserQuery: () => ({ data: { email: "user@example.com" } }),
}))

vi.mock("@/components/layout/FeedbackDialog", () => ({
  FeedbackDialog: () => null,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("MobileHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it("signs out and returns to the locale home through Next navigation", async () => {
    fireEvent.click(render(<MobileHeader />).getByRole("button", { name: "auth.logout" }))

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce())
    expect(mocks.replace).toHaveBeenCalledWith("/en")
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.setQueryData).toHaveBeenCalledWith(["account", "current-user"], null)
    expect(mocks.removeQueries).toHaveBeenCalledWith({ queryKey: ["account", "profile"] })
    expect(screen.getByText("user@example.com")).toBeInTheDocument()
  })

  it("keeps the account state when sign-out fails", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("network unavailable") })

    fireEvent.click(render(<MobileHeader />).getByRole("button", { name: "auth.logout" }))

    await waitFor(() => expect(mocks.errorToast).toHaveBeenCalledWith("auth.signOutFailed"))
    expect(mocks.setQueryData).not.toHaveBeenCalled()
    expect(mocks.removeQueries).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
