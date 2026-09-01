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

  it("forwards accepted landing intent without visitor input or identity", () => {
    trackGrowthEvent("landing_agent_intent", {
      locale: "en",
      destination: "login",
      source: "apple_podcasts",
    })

    expect(analytics.track).toHaveBeenCalledWith("landing_agent_intent", {
      locale: "en",
      destination: "login",
      source: "apple_podcasts",
    })
  })

  it("forwards task and pricing funnel events with bounded enum payloads only", () => {
    trackGrowthEvent("task_create_accepted", {
      locale: "en",
      surface: "workspace",
    })
    trackGrowthEvent("source_followup_started", {
      locale: "en",
      source: "latent-space",
    })
    trackGrowthEvent("task_result_view", {
      locale: "zh",
    })
    trackGrowthEvent("pricing_plan_open", {
      locale: "ja",
      plan: "topup",
      destination: "pricing",
    })
    trackGrowthEvent("pricing_plan_open", {
      locale: "en",
      plan: "free",
      destination: "chat",
    })
    trackGrowthEvent("pricing_checkout_redirect", {
      locale: "en",
      product: "pro",
      billing: "annual",
    })
    trackGrowthEvent("source_followup_started", {
      locale: "zh",
      source: "latent-space",
    })
    trackGrowthEvent("auth_signup_submit", {
      locale: "en",
      surface: "handoff",
    })

    expect(analytics.track).toHaveBeenNthCalledWith(1, "task_create_accepted", {
      locale: "en",
      surface: "workspace",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(2, "source_followup_started", {
      locale: "en",
      source: "latent-space",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(3, "task_result_view", {
      locale: "zh",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(4, "pricing_plan_open", {
      locale: "ja",
      plan: "topup",
      destination: "pricing",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(5, "pricing_plan_open", {
      locale: "en",
      plan: "free",
      destination: "chat",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(6, "pricing_checkout_redirect", {
      locale: "en",
      product: "pro",
      billing: "annual",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(7, "source_followup_started", {
      locale: "zh",
      source: "latent-space",
    })
    expect(analytics.track).toHaveBeenNthCalledWith(8, "auth_signup_submit", {
      locale: "en",
      surface: "handoff",
    })
  })

  it("does not let analytics failures interrupt product actions", () => {
    analytics.track.mockImplementationOnce(() => {
      throw new Error("analytics unavailable")
    })

    expect(() => trackGrowthEvent("pricing_checkout_redirect", {
      locale: "en",
      product: "topup",
      billing: "one_time",
    })).not.toThrow()
  })
})
