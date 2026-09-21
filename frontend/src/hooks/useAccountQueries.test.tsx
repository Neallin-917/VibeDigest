import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { projectAccountProfile, useCurrentUserQuery, useProfileQuery } from "./useAccountQueries"

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


describe("account display projection", () => {
    const now = Date.parse("2026-09-20T00:00:00Z")
    const profile = { tier: "pro", usage_count: 80, usage_limit: 100, extra_credits: 7 }

    it("expires Pro at the paid boundary and preserves top-ups without mutating input", () => {
        const expired = { ...profile, period_end: "2026-09-20T00:00:00Z" }
        expect(projectAccountProfile(expired, now)).toMatchObject({ tier: "free", usage_limit: 3, usage_count: 0, extra_credits: 7 })
        expect(expired.tier).toBe("pro")
        expect(expired.usage_count).toBe(80)
    })
    it("resets monthly usage while retaining paid entitlement and top-ups", () => {
        expect(projectAccountProfile({ ...profile, usage_reset_at: "2026-09-01T00:00:00Z", period_end: "2027-01-01T00:00:00Z" }, now))
            .toMatchObject({ tier: "pro", usage_limit: 100, usage_count: 0, extra_credits: 7 })
    })
    it("keeps current usage before the reset boundary", () => {
        expect(projectAccountProfile({ ...profile, usage_reset_at: "2026-10-01T00:00:00Z" }, now).usage_count).toBe(80)
    })
    it("does not guess expiry when legacy dates are unknown or invalid", () => {
        expect(projectAccountProfile(profile, now)).toEqual(profile)
        expect(projectAccountProfile({ ...profile, period_end: "invalid" }, now).tier).toBe("pro")
    })
})
