import { describe, expect, it } from "vitest"
import { findPodcastSource, PODCAST_SOURCES } from "./podcast-sources"

describe("podcast source catalog", () => {
  it("contains the 21 curated sources with stable unique ids", () => {
    expect(PODCAST_SOURCES).toHaveLength(21)
    expect(new Set(PODCAST_SOURCES.map((source) => source.id)).size).toBe(21)
    expect(PODCAST_SOURCES.filter((source) => source.featured)).toHaveLength(5)
  })

  it("matches a source from either author metadata or its channel URL", () => {
    expect(findPodcastSource("The MAD Podcast with Matt Turck")?.id).toBe("mad-podcast")
    expect(findPodcastSource(undefined, "https://www.youtube.com/@anthropic-ai/videos")?.id).toBe("anthropic")
  })

  it("does not classify unrelated demo content as an AI podcast source", () => {
    expect(findPodcastSource("Business Breakdowns", "https://www.youtube.com/watch?v=example")).toBeNull()
  })
})
