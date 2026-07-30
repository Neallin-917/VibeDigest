import type { ReactNode } from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Providers } from "./providers"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"

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

vi.mock("next-themes", () => ({
    ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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

    it("keeps the shared account query in sync after the initial validated lookup", async () => {
        render(
            <Providers locale="en">
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
