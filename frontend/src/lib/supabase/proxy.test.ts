import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const supabaseState = vi.hoisted(() => ({
  cookieAdapter: null as null | {
    setAll: (cookies: Array<{
      name: string
      value: string
      options?: Record<string, unknown>
    }>) => void
  },
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((
    _url: string,
    _key: string,
    options: { cookies: typeof supabaseState.cookieAdapter },
  ) => {
    supabaseState.cookieAdapter = options.cookies
    return {
      auth: {
        getUser: vi.fn(async () => {
          options.cookies?.setAll([{
            name: "session",
            value: "refreshed",
            options: { httpOnly: true },
          }])
          return { data: { user: null } }
        }),
      },
    }
  }),
}))

import { updateSession } from "./proxy"

describe("updateSession locale forwarding", () => {
  beforeEach(() => {
    supabaseState.cookieAdapter = null
  })

  it("preserves internal request headers when Supabase refreshes cookies", async () => {
    const request = new NextRequest("http://localhost:3000/zh/privacy")
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-vd-locale", "zh")

    const { response } = await updateSession(request, requestHeaders)

    expect(response.headers.get("x-middleware-request-x-vd-locale")).toBe("zh")
    expect(response.headers.get("x-vd-locale")).toBeNull()
    expect(response.cookies.get("session")?.value).toBe("refreshed")
  })
})
