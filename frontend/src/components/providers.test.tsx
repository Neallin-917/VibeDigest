import type { ReactNode } from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Providers } from "./providers"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import type { Messages } from "@/lib/i18n"

const messages: Messages = {}

const authMocks = vi.hoisted(() => ({
    callback: undefined as
        | ((event: string, session: { user: { id: string; email: string } } | null) => void)
        | undefined,
    getUser: vi.fn(),
    unsubscribe: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({
    createClient: () => ({
        auth: {
            getUser: authMocks.getUser,
            onAuthStateChange: vi.fn((callback) => {
                authMocks.callback = callback
                return {
                    data: {
                        subscription: { unsubscribe: authMocks.unsubscribe },
                    },
                }
            }),
        },
    }),
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    I18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function AccountProbe() {
    const { data: user, isPending } = useCurrentUserQuery()
    return <div>{isPending ? "loading" : user?.email ?? "guest"}</div>
}

describe("Providers account session sync", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        authMocks.callback = undefined
        authMocks.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        })
    })

    it("uses the initial browser session while the validated lookup continues", async () => {
        let resolveUserLookup: ((value: {
            data: { user: { id: string; email: string } }
            error: null
        }) => void) | undefined
        authMocks.getUser.mockReturnValue(new Promise((resolve) => {
            resolveUserLookup = resolve
        }))

        render(
            <Providers locale="en" messages={messages}>
                <AccountProbe />
            </Providers>,
        )

        await waitFor(() => expect(authMocks.callback).toBeTypeOf("function"))
        act(() => {
            authMocks.callback?.("INITIAL_SESSION", {
                user: { id: "user-1", email: "user@example.com" },
            })
        })

        expect(await screen.findByText("user@example.com")).toBeInTheDocument()
        expect(authMocks.getUser).toHaveBeenCalledTimes(1)

        await act(async () => {
            resolveUserLookup?.({
                data: {
                    user: { id: "user-1", email: "user@example.com" },
                },
                error: null,
            })
        })
        expect(screen.getByText("user@example.com")).toBeInTheDocument()
    })

    it("keeps the shared account query in sync with later auth changes", async () => {
        render(
            <Providers locale="en" messages={messages}>
                <AccountProbe />
            </Providers>,
        )

        expect(await screen.findByText("guest")).toBeInTheDocument()
        await waitFor(() => expect(authMocks.callback).toBeTypeOf("function"))

        act(() => {
            authMocks.callback?.("SIGNED_IN", {
                user: { id: "user-1", email: "user@example.com" },
            })
        })
        await waitFor(() => {
            expect(screen.getByText("user@example.com")).toBeInTheDocument()
        })

        act(() => {
            authMocks.callback?.("SIGNED_OUT", null)
        })
        await waitFor(() => {
            expect(screen.getByText("guest")).toBeInTheDocument()
        })
        expect(authMocks.getUser).toHaveBeenCalledTimes(1)
    })
})
