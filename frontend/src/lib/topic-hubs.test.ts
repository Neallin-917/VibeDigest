import { describe, expect, it } from "vitest"

import { TOPIC_ROUTE_ORDER, getTopicHubCopy, getTopicSourceIds, isPodcastTopic } from "./topic-hubs"

describe("topic hubs", () => {
  it("keeps only the curated public topic order", () => {
    expect(TOPIC_ROUTE_ORDER).toEqual([
      "agents",
      "ai-coding",
      "product",
      "startups",
      "research",
    ])
  })

  it("maps topics to known source slugs without generating unknown routes", () => {
    expect(isPodcastTopic("agents")).toBe(true)
    expect(isPodcastTopic("politics")).toBe(false)
    expect(getTopicSourceIds("agents")).toEqual(expect.arrayContaining([
      "latent-space",
      "a16z",
      "anthropic",
    ]))
  })

  it("returns localized topic copy for metadata and page intros", () => {
    expect(getTopicHubCopy("en", "product")).toMatchObject({
      slug: "product",
      shortLabel: "Product",
    })
    expect(TOPIC_ROUTE_ORDER.map((topic) => getTopicHubCopy("zh", topic).shortLabel)).toEqual([
      "AI 智能体",
      "AI 编程",
      "产品",
      "创业",
      "研究",
    ])
    expect(getTopicHubCopy("zh", "agents").description).toContain("智能体工作流")
    expect(getTopicHubCopy("zh", "startups").description).toContain("市场进入策略")
  })
})
