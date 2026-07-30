import { expect, test } from "@playwright/test"

import { setupApiMocks } from "./fixtures/mock-api"

test.describe("Shared account state", () => {
    test("reuses account and plan data from chat to pricing", async ({ page }, testInfo) => {
        test.skip(
            testInfo.project.name === "chromium-guest",
            "Account cache behavior requires an authenticated session",
        )

        let profileRequests = 0

        await setupApiMocks(page, { isAuthenticated: true })
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            || "https://cwdgdytqafqrqnlcdpcc.supabase.co"
        const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\./)?.[1]
            || "placeholder"
        const storageKey = `sb-${projectRef}-auth-token`
        const session = {
            access_token: "fake-jwt-token",
            refresh_token: "fake-refresh-token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user: {
                id: "test-user-id",
                aud: "authenticated",
                role: "authenticated",
                email: "e2e@vibedigest.io",
            },
        }
        const serializedSession = JSON.stringify(session)

        await page.addInitScript(
            ({ key, value }) => window.localStorage.setItem(key, value),
            { key: storageKey, value: serializedSession },
        )
        await page.context().addCookies([{
            name: storageKey,
            value: serializedSession,
            domain: "localhost",
            path: "/",
        }])
        await page.route("**/auth/v1/user", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    id: "test-user-id",
                    aud: "authenticated",
                    role: "authenticated",
                    email: "e2e@vibedigest.io",
                }),
            })
        })
        await page.route("**/rest/v1/profiles*", async (route) => {
            profileRequests += 1
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    tier: "pro",
                    usage_count: 8,
                    usage_limit: 100,
                    extra_credits: 5,
                }),
            })
        })

        await page.goto("/en/chat")

        await expect(page.getByLabel("Chat input")).toBeVisible()
        await expect(page.getByRole("button", { name: "Pro", exact: true })).toBeVisible()
        expect(profileRequests).toBe(1)

        await page.getByRole("button", { name: "Pro", exact: true }).click()
        await page.getByRole("link", { name: /Monthly Credits/ }).click()

        await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Manage Subscription" })).toBeVisible()
        expect(profileRequests).toBe(1)
    })
})
