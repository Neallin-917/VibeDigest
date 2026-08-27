import { describe, expect, it } from "vitest"
import { SECURITY_HEADERS } from "./security-headers"

describe("security headers", () => {
  it("keeps the baseline protections explicit and non-conflicting", () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]))).toEqual({
      "Content-Security-Policy": "base-uri 'self'; frame-ancestors 'self'; object-src 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Permitted-Cross-Domain-Policies": "none",
    })
  })
})
