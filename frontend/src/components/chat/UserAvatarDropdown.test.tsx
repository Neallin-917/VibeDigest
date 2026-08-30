import type { User } from "@supabase/supabase-js"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountKeys } from "@/hooks/useAccountQueries"
import { UserAvatarDropdown } from "./UserAvatarDropdown"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  errorToast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: mocks }),
}))

vi.mock("sonner", () => ({
  toast: { error: mocks.errorToast },
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
  useI18n: () => ({ locale: "zh", t: (key: string) => key }),
}))

vi.mock("@/components/layout/FeedbackDialog", () => ({
  FeedbackDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Feedback</div> : null,
}))

function makeUser(email: string): User {
  return {
    id: email,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-28T00:00:00Z",
  }
}

const queryClients: QueryClient[] = []

function createQueryClient(user: User | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  queryClient.setQueryData(accountKeys.currentUser, user)
  queryClients.push(queryClient)
  return queryClient
}

describe("UserAvatarDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
    queryClients.splice(0).forEach((client) => client.clear())
  })

  it.each([null, makeUser("bob@example.com")])(
    "hydrates without recovery when server user %j differs from the warm client cache",
    async (serverUser) => {
      const serverClient = createQueryClient(serverUser)
      const clientClient = createQueryClient(makeUser("alice@example.com"))
      const container = document.createElement("div")
      document.body.appendChild(container)
      container.innerHTML = renderToString(
        <QueryClientProvider client={serverClient}>
          <UserAvatarDropdown />
        </QueryClientProvider>,
      )
      const serverButton = within(container).getByRole("button", { name: "chat.moreOptionsHint" })
      const onRecoverableError = vi.fn()
      let root: Root | undefined

      try {
        expect(serverButton).toHaveTextContent("U")
        expect(clientClient.getQueryState(accountKeys.currentUser)?.status).toBe("success")
        await act(async () => {
          root = hydrateRoot(
            container,
            <QueryClientProvider client={clientClient}>
              <UserAvatarDropdown />
            </QueryClientProvider>,
            { onRecoverableError },
          )
        })

        expect(onRecoverableError).not.toHaveBeenCalled()
        expect(within(container).getByRole("button", { name: "chat.moreOptionsHint" })).toBe(serverButton)
        expect(serverButton).toHaveTextContent("A")
        expect(mocks.getUser).not.toHaveBeenCalled()
      } finally {
        await act(async () => root?.unmount())
        container.remove()
      }
    },
  )

  it("keeps the fallback, requested size, and subsequent account updates", async () => {
    const queryClient = createQueryClient(null)
    render(
      <QueryClientProvider client={queryClient}>
        <UserAvatarDropdown size="sm" className="custom-avatar" />
      </QueryClientProvider>,
    )
    const button = screen.getByRole("button", { name: "chat.moreOptionsHint" })
    expect(button).toHaveTextContent("U")
    expect(button).toHaveClass("h-8", "w-8", "custom-avatar")

    act(() => queryClient.setQueryData(accountKeys.currentUser, makeUser("alice@example.com")))
    await waitFor(() => expect(button).toHaveTextContent("A"))
    act(() => queryClient.setQueryData(accountKeys.currentUser, null))
    await waitFor(() => expect(button).toHaveTextContent("U"))
  })

  it("preserves account details, localized links, and the feedback action", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={createQueryClient(makeUser("alice@example.com"))}>
        <UserAvatarDropdown />
      </QueryClientProvider>,
    )
    const button = screen.getByRole("button", { name: "chat.moreOptionsHint" })
    expect(button).toHaveClass("h-9", "w-9", "md:h-10", "md:w-10")
    await user.click(button)
    expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "nav.settings" })).toHaveAttribute("href", "/zh/settings")
    expect(screen.getByRole("menuitem", { name: "nav.pricing" })).toHaveAttribute("href", "/zh/settings/pricing")
    await user.click(screen.getByRole("menuitem", { name: "feedback.title" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("Feedback")
  })

  it("preserves logout, account-cache clearing, and the home redirect", async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient(makeUser("alice@example.com"))
    queryClient.setQueryData(accountKeys.profile("alice@example.com"), { tier: "pro" })
    render(
      <QueryClientProvider client={queryClient}>
        <UserAvatarDropdown />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole("button", { name: "chat.moreOptionsHint" }))

    const disableAutoSelect = vi.fn()
    vi.stubGlobal("window", new Proxy(window, {
      get(target, property) {
        if (property === "google") return { accounts: { id: { disableAutoSelect } } }
        return Reflect.get(target, property, target)
      },
    }))
    await user.click(screen.getByRole("menuitem", { name: "auth.logout" }))

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/zh"))
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(disableAutoSelect).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(accountKeys.currentUser)).toBeNull()
    expect(queryClient.getQueryData(accountKeys.profile("alice@example.com"))).toBeUndefined()
  })

  it("preserves the session-facing state when logout fails", async () => {
    const user = userEvent.setup()
    const account = makeUser("alice@example.com")
    const queryClient = createQueryClient(account)
    mocks.signOut.mockResolvedValue({ error: new Error("network unavailable") })
    render(
      <QueryClientProvider client={queryClient}>
        <UserAvatarDropdown />
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole("button", { name: "chat.moreOptionsHint" }))
    await user.click(screen.getByRole("menuitem", { name: "auth.logout" }))

    await waitFor(() => expect(mocks.errorToast).toHaveBeenCalledWith("auth.signOutFailed"))
    expect(queryClient.getQueryData(accountKeys.currentUser)).toEqual(account)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
