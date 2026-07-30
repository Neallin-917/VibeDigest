import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useCurrentUserQuery, useProfileQuery } from "./useAccountQueries"

const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockSupabase = {
    auth: {
        getUser: mockGetUser,
    },
    from: vi.fn(() => ({ select: mockSelect })),
}

vi.mock("@/lib/supabase", () => ({
    createClient: () => mockSupabase,
}))

function createWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        )
    }
}

describe("account queries", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetUser.mockResolvedValue({
            data: { user: { id: "user-1", email: "user@example.com" } },
            error: null,
        })
        mockSingle.mockResolvedValue({
            data: {
                tier: "pro",
                usage_count: 8,
                usage_limit: 100,
                extra_credits: 5,
            },
            error: null,
        })
    })

    it("deduplicates concurrent current-user consumers", async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        })

        const { result } = renderHook(
            () => [
                useCurrentUserQuery(),
                useCurrentUserQuery(),
                useCurrentUserQuery(),
            ],
            { wrapper: createWrapper(queryClient) },
        )

        await waitFor(() => {
            expect(result.current.every((query) => query.isSuccess)).toBe(true)
        })

        expect(mockGetUser).toHaveBeenCalledTimes(1)
    })

    it("treats a missing auth session as a normal guest state", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: null },
            error: { name: "AuthSessionMissingError", message: "Auth session missing" },
        })
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
        })

        const { result } = renderHook(() => useCurrentUserQuery(), {
            wrapper: createWrapper(queryClient),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toBeNull()
        expect(mockGetUser).toHaveBeenCalledTimes(1)
    })

    it("reuses a fresh profile across component remounts", async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        })
        const wrapper = createWrapper(queryClient)
        const first = renderHook(() => useProfileQuery("user-1"), { wrapper })

        await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
        first.unmount()

        const second = renderHook(() => useProfileQuery("user-1"), { wrapper })
        await waitFor(() => expect(second.result.current.isSuccess).toBe(true))

        expect(second.result.current.data?.tier).toBe("pro")
        expect(mockSelect).toHaveBeenCalledTimes(1)
    })
})
