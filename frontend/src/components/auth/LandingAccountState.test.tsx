import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GoogleOneTap } from "./GoogleOneTap"
import { LandingUserButton } from "./LandingUserButton"
import { PricingSection } from "@/components/landing/PricingSection"
import { accountKeys, useCurrentUserQuery } from "@/hooks/useAccountQueries"

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    signOut: vi.fn(),
    signInWithIdToken: vi.fn(),
    push: vi.fn(),
    initializeOneTap: vi.fn(),
    promptOneTap: vi.fn(),
    cancelOneTap: vi.fn(),
    successToast: vi.fn(),
    errorToast: vi.fn(),
    credentialCallback: undefined as ((response: { credential: string }) => void) | undefined,
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
}))

vi.mock("@/lib/supabase", () => ({
    createClient: () => ({
        auth: {
            getUser: mocks.getUser,
            signOut: mocks.signOut,
            signInWithIdToken: mocks.signInWithIdToken,
        },
    }),
}))

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id" },
}))

vi.mock("sonner", () => ({
    toast: {
        success: mocks.successToast,
        error: mocks.errorToast,
    },
}))

vi.mock("@/components/i18n/I18nProvider", () => ({
    useI18n: () => ({
        locale: "en",
        t: (key: string, vars?: Record<string, string | number>) => {
            const translations: Record<string, string> = {
                "auth.goToDashboard": "Go to Dashboard",
                "auth.signUp": "Sign Up",
                "chat.moreOptionsHint": "Open account menu",
                "landing.simplePricing": "Simple Pricing",
                "landing.simplePricingSubtitle": "Choose the plan that fits your needs",
                "landing.getStarted": "Get started",
                "landing.mostPopular": "Most popular",
                "landing.viewPlan": "View plan",
                "landing.effectiveMonthly": "effective / month",
                "landing.proAnnualBilling": "{annualPrice} billed annually.",
                "pricing.free.title": "Basic",
                "pricing.free.desc": "Try VibeDigest",
                "pricing.pro.title": "Pro",
                "pricing.topup.title": "Top-up",
                "pricing.topup.desc": "Pay once",
                "pricing.topup.button": "Buy credits",
                "pricing.features.monthlyVideos": "{count} videos / month",
                "pricing.features.saveNotes": "Save notes",
                "pricing.features.multilingualSummaries": "Multilingual summaries",
                "pricing.features.everythingInBasic": "Everything in Basic",
                "pricing.features.topUpVideos": "{count} videos per pack",
                "pricing.features.neverExpires": "Never expires",
                "pricing.features.anyPlan": "Works with any plan",
            }

            return (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
        },
    }),
}))

function createQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
}

function createWrapper(queryClient = createQueryClient()) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        )
    }
}

function AccountProbe() {
    const { data: user, isPending } = useCurrentUserQuery()
    return <div>{isPending ? "loading" : user?.email ?? "guest"}</div>
}

describe("landing account state", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.credentialCallback = undefined
        mocks.initializeOneTap.mockImplementation((config) => {
            mocks.credentialCallback = config.callback
        })
        Object.defineProperty(window, "google", {
            configurable: true,
            value: {
                accounts: {
                    id: {
                        initialize: mocks.initializeOneTap,
                        prompt: mocks.promptOneTap,
                        cancel: mocks.cancelOneTap,
                        disableAutoSelect: vi.fn(),
                        revoke: vi.fn(),
                    },
                },
            },
        })
        mocks.getUser.mockResolvedValue({
            data: {
                user: {
                    id: "user-1",
                    email: "user@example.com",
                    user_metadata: { full_name: "Example User" },
                },
            },
            error: null,
        })
        mocks.signOut.mockResolvedValue({ error: null })
    })

    it("shares one current-user lookup across all landing account consumers", async () => {
        render(
            <>
                <GoogleOneTap />
                <LandingUserButton />
                <PricingSection />
            </>,
            { wrapper: createWrapper() },
        )

        expect(await screen.findByRole("link", { name: "Go to Dashboard" })).toBeInTheDocument()
        await waitFor(() => expect(mocks.getUser).toHaveBeenCalledTimes(1))
    })

    it("uses a calm placeholder instead of a shimmer while auth resolves", () => {
        mocks.getUser.mockReturnValue(new Promise(() => undefined))
        const { container } = render(<LandingUserButton />, { wrapper: createWrapper() })

        expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
        expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument()
    })

    it("updates the shared account state after One Tap without reloading the page", async () => {
        mocks.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        })
        mocks.signInWithIdToken.mockResolvedValue({
            data: {
                user: { id: "user-1", email: "user@example.com" },
                session: { access_token: "token" },
            },
            error: null,
        })
        render(
            <>
                <GoogleOneTap />
                <AccountProbe />
            </>,
            { wrapper: createWrapper() },
        )

        expect(await screen.findByText("guest")).toBeInTheDocument()
        const script = await waitFor(() => {
            const element = document.querySelector<HTMLScriptElement>(
                "script[src='https://accounts.google.com/gsi/client']",
            )
            expect(element).not.toBeNull()
            return element as HTMLScriptElement
        })
        fireEvent.load(script)
        await waitFor(() => expect(mocks.credentialCallback).toBeTypeOf("function"))

        await act(async () => {
            await mocks.credentialCallback?.({ credential: "credential" })
        })

        expect(await screen.findByText("user@example.com")).toBeInTheDocument()
        expect(mocks.signInWithIdToken).toHaveBeenCalledTimes(1)
        expect(mocks.successToast).toHaveBeenCalledWith("auth.signInSuccess")
    })

    it("clears the shared account cache only after logout succeeds", async () => {
        const user = userEvent.setup()
        const queryClient = createQueryClient()
        queryClient.setQueryData(accountKeys.profile("user-1"), { tier: "pro" })
        render(
            <>
                <LandingUserButton />
                <AccountProbe />
            </>,
            { wrapper: createWrapper(queryClient) },
        )

        expect(await screen.findByText("user@example.com")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Open account menu" }))
        await user.click(screen.getByRole("menuitem", { name: "auth.logout" }))

        expect(await screen.findByText("guest")).toBeInTheDocument()
        expect(mocks.signOut).toHaveBeenCalledOnce()
        expect(queryClient.getQueryData(accountKeys.profile("user-1"))).toBeUndefined()
    })

    it("keeps the shared account cache when logout fails", async () => {
        const user = userEvent.setup()
        mocks.signOut.mockResolvedValue({ error: new Error("network unavailable") })
        render(
            <>
                <LandingUserButton />
                <AccountProbe />
            </>,
            { wrapper: createWrapper() },
        )

        expect(await screen.findByText("user@example.com")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Open account menu" }))
        await user.click(screen.getByRole("menuitem", { name: "auth.logout" }))

        await waitFor(() => expect(mocks.errorToast).toHaveBeenCalledWith("auth.signOutFailed"))
        expect(screen.getByText("user@example.com")).toBeInTheDocument()
    })
})
