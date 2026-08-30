export const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; frame-ancestors 'self'; object-src 'none'",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
] as const
