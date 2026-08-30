import { beforeEach, describe, expect, it, vi } from "vitest"

const analytics = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@vercel/analytics", () => analytics)

import { trackGrowthEvent } from "./growth-events"

describe("growth event vocabulary", () => {
  beforeEach(() => analytics.track.mockReset())

  it("forwards the typed event name and bounded public dimensions to Vercel Analytics", () => {
    trackGrowthEvent("public_digest_share", {
      locale: "zh",
      source: "latent-space",
      method: "copy_link",
    })

    expect(analytics.track).toHaveBeenCalledWith("public_digest_share", {
      locale: "zh",
      source: "latent-space",
      method: "copy_link",
    })
  })

  it("forwards the quota pricing intent with only locale and bounded surface", () => {
    trackGrowthEvent("quota_pricing_open", {
      locale: "ja",
      surface: "source_followup",
    })

    expect(analytics.track).toHaveBeenCalledWith("quota_pricing_open", {
      locale: "ja",
      surface: "source_followup",
    })
  })
})
