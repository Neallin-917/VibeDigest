import { afterEach, describe, expect, it, vi } from "vitest"
import { CHAT_EXAMPLE_LIMIT, getChatExamples } from "./chat-examples"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("getChatExamples", () => {
  it("requests only the public fields needed by the welcome screen", async () => {
    const rows = [
      {
        id: "task-1",
        video_url: "https://example.com/video",
        video_title: "Example",
        thumbnail_url: null,
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getChatExamples()).resolves.toEqual([
      {
        id: "task-1",
        video_url: "https://example.com/video",
        video_title: "Example",
        thumbnail_url: undefined,
      },
    ])

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit & {
      next?: { revalidate?: number }
    }]
    expect(requestUrl.searchParams.get("select")).toBe(
      "id,video_url,video_title,thumbnail_url"
    )
    expect(requestUrl.searchParams.get("limit")).toBe(String(CHAT_EXAMPLE_LIMIT))
    expect(requestInit.next?.revalidate).toBe(300)
  })

  it("degrades to an empty list when the public query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(getChatExamples()).resolves.toEqual([])
  })
})
