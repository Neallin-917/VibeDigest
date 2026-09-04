import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NODE_ENV: "test",
  },
}))

import { GET as getRootCallback } from "./route"
import { GET as getLocalizedCallback } from "../../[lang]/auth/callback/route"

describe("auth callback return target", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    auth.exchangeCodeForSession.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: "root callback",
      run: (request: Request) => getRootCallback(request),
      url: "https://vibedigest.io/auth/callback?code=code-1&next=%2Fen%2Fsettings%2Fpricing%23pro",
      expected: "https://vibedigest.io/en/settings/pricing#pro",
    },
    {
      name: "localized callback",
      run: (request: Request) => getLocalizedCallback(request, { params: Promise.resolve({ lang: "en" }) }),
      url: "https://vibedigest.io/en/auth/callback?code=code-2&next=%2Fen%2Fsettings%2Fpricing%23topup",
      expected: "https://vibedigest.io/en/settings/pricing#topup",
    },
  ])("preserves the pricing anchor through the $name", async ({ run, url, expected }) => {
    const response = await run(new Request(url))

    expect(response.headers.get("location")).toBe(expected)
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce()
  })

  it.each([
    {
      name: "root callback",
      run: (request: Request) => getRootCallback(request),
      url: "https://vibedigest.io/auth/callback?code=bad-code&lang=zh",
    },
    {
      name: "localized callback",
      run: (request: Request) => getLocalizedCallback(request, { params: Promise.resolve({ lang: "zh" }) }),
      url: "https://vibedigest.io/zh/auth/callback?code=bad-code",
    },
  ])("returns only a stable error code from the $name", async ({ run, url }) => {
    auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("PRIVATE_TOKEN=secret <html>upstream failure</html>"),
    })

    const response = await run(new Request(url))
    const location = response.headers.get("location")

    expect(location).toBe("https://vibedigest.io/zh/login?error=auth_callback_failed")
    expect(location).not.toContain("PRIVATE_TOKEN")
    expect(location).not.toContain("upstream")
    expect(console.error).toHaveBeenCalledWith("Auth callback session exchange failed")
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("PRIVATE_TOKEN")
  })

  it.each([
    {
      name: "root callback",
      run: (request: Request) => getRootCallback(request),
      url: "https://vibedigest.io/auth/callback?lang=zh",
    },
    {
      name: "localized callback",
      run: (request: Request) => getLocalizedCallback(request, { params: Promise.resolve({ lang: "zh" }) }),
      url: "https://vibedigest.io/zh/auth/callback",
    },
  ])("uses a stable missing-code error from the $name", async ({ run, url }) => {
    const response = await run(new Request(url))

    expect(response.headers.get("location"))
      .toBe("https://vibedigest.io/zh/login?error=auth_callback_missing_code")
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})
