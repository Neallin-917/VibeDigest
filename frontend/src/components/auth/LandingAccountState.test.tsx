import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GoogleOneTap } from "./GoogleOneTap"
import { LandingUserButton } from "./LandingUserButton"
import { PricingSection } from "@/components/landing/PricingSection"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"

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
        t: (key: string) => {
            const translations: Record<string, string> = {
                "auth.goToDashboard": "Go to Dashboard",
                "auth.signUp": "Sign Up",
                "chat.moreOptionsHint": "Open account menu",
                "landing.simplePricing": "Simple Pricing",
                "landing.simplePricingSubtitle": "Choose the plan that fits your needs",
                "landing.getStarted": "Get started",
                "landing.mostPopular": "Most popular",
                "landing.viewPlan": "View plan",
                "pricing.free.title": "Free",
                "pricing.free.price": "$0",
                "pricing.free.desc": "Try VibeDigest",
                "pricing.free.features.f1": "3 videos",
                "pricing.free.features.f4": "Save notes",
                "pricing.free.features.f5": "Translate transcripts",
                "pricing.pro.title": "Pro",
                "pricing.pro.price": "$9.99",
                "pricing.pro.unit": "/ month",
                "pricing.pro.desc": "For frequent use",
                "pricing.pro.features.f1": "100 videos",
                "pricing.pro.features.f2": "Everything in Free",
                "pricing.topup.title": "Top-up",
                "pricing.topup.price": "$4.99",
                "pricing.topup.desc": "Pay once",
                "pricing.topup.features.f1": "50 videos",
                "pricing.topup.features.f2": "Never expires",
                "pricing.topup.features.f3": "Works with any plan",
                "pricing.topup.button": "Buy credits",
            }

            return translations[key] ?? key
        },
    }),
}))

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })

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
})
