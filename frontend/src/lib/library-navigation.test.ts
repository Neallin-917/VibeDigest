import { describe, expect, it } from "vitest"
import { buildLibraryHref, libraryEpisodeAnchor, parseLibraryReturnHref } from "./library-navigation"

describe("library navigation", () => {
  it("round-trips a topic, filters, loaded page and reading position", () => {
    const href = `${buildLibraryHref("/zh/topics/agents", "latent-space", "AI agents", 3)}#${libraryEpisodeAnchor("a-b-123")}`
    expect(parseLibraryReturnHref(href, "zh")).toBe("/zh/topics/agents?show=latent-space&q=AI+agents&page=3#episode-a-b-123")
  })

  it("preserves a supported source language when no locale restriction is supplied", () => {
    const source = "/en/topics/agents?show=latent-space&q=AI&page=3#episode-a-b-123"
    expect(parseLibraryReturnHref(source)).toBe(source)
    expect(parseLibraryReturnHref(source, "zh")).toBeNull()
    expect(parseLibraryReturnHref("/fr/explore")).toBeNull()
    expect(parseLibraryReturnHref("//outside.example/en/explore")).toBeNull()
  })

  it.each([
    "https://outside.example/en/explore",
    "//outside.example/en/explore",
    "/zh/explore",
    "/en/chat",
    "/en/topics/unknown",
    "/en/topics/agents/extra",
    "/en/explore/../chat",
    "/en/\\outside.example/explore",
  ])("rejects a non-library or different-language return target: %s", (href) => {
    expect(parseLibraryReturnHref(href, "en")).toBeNull()
  })

  it("keeps only supported filters and episode anchors", () => {
    expect(parseLibraryReturnHref("/en/explore?show=invalid%2Fsource&q=AI&page=500&next=https://outside.example#other", "en"))
      .toBe("/en/explore?q=AI&page=20")
    expect(parseLibraryReturnHref("/en/explore?page=-3", "en")).toBe("/en/explore")
  })
})
