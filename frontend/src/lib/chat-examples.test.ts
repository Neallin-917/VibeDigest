import { afterEach, describe, expect, it, vi } from "vitest"
import { CHAT_EXAMPLE_LIMIT, getChatExample, getChatExamples } from "./chat-examples"
import { LANDING_DEMO } from "./landing-demo"
import landingSummaries from "./fixtures/landing-demo-summaries.json"

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
      "id,video_url,video_title,thumbnail_url,task_outputs!inner(id)"
    )
    expect(requestUrl.searchParams.get("publication_status")).toBe("eq.published")
    expect(requestUrl.searchParams.get("task_outputs.kind")).toBe("eq.summary")
    expect(requestUrl.searchParams.get("task_outputs.status")).toBe("eq.completed")
    expect(requestUrl.searchParams.get("limit")).toBe(String(CHAT_EXAMPLE_LIMIT))
    expect(requestInit.next?.revalidate).toBe(300)
  })

  it("degrades to an empty list when the public query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(getChatExamples()).resolves.toEqual([])
  })

  it("resolves a direct link only when it remains a completed public demo", async () => {
    const taskId = "8ecdf78a-a13a-4f15-9bea-910d73917b55"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{
        id: taskId,
        video_url: "https://example.com/demo",
        video_title: "Demo",
        thumbnail_url: null,
      }]), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getChatExample(taskId)).resolves.toMatchObject({
      id: taskId,
      video_title: "Demo",
    })

    const [requestUrl] = fetchMock.mock.calls[0] as [URL]
    expect(requestUrl.searchParams.get("id")).toBe(`eq.${taskId}`)
    expect(requestUrl.searchParams.get("is_demo")).toBe("eq.true")
    expect(requestUrl.searchParams.get("status")).toBe("eq.completed")
    expect(requestUrl.searchParams.get("publication_status")).toBe("eq.published")
    expect(requestUrl.searchParams.get("task_outputs.kind")).toBe("eq.summary")
    expect(requestUrl.searchParams.get("task_outputs.status")).toBe("eq.completed")
    expect(requestUrl.searchParams.get("limit")).toBe("1")
  })

  it("does not query Supabase for an invalid direct task ID", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(getChatExample("not-a-task-id")).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["en", "zh"] as const)("validates the published %s summary without caching availability or leaking its payload", async (locale) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { ...LANDING_DEMO, task_outputs: landingSummaries.outputs },
    ])))
    vi.stubGlobal("fetch", fetchMock)

    const example = await getChatExample(LANDING_DEMO.id, locale)
    expect(example?.id).toBe(LANDING_DEMO.id)
    expect(example).not.toHaveProperty("task_outputs")
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.searchParams.get("select")).toContain("task_outputs!inner(kind,status,locale,content)")
    expect(url.searchParams.get("publication_status")).toBe("eq.published")
    expect(url.searchParams.get("task_outputs.status")).toBe("eq.completed")
    expect(options.cache).toBe("no-store")
  })

  it.each([
    { name: "missing language", locale: "ja" as const, outputs: landingSummaries.outputs },
    { name: "missing outputs", locale: "zh" as const, outputs: [] },
    { name: "invalid summary", locale: "zh" as const, outputs: [{ kind: "summary", status: "completed", locale: "zh", content: {} }] },
    { name: "failed summary", locale: "zh" as const, outputs: landingSummaries.outputs.map(output => ({ ...output, status: "failed" })) },
  ])("rejects a landing example with $name", async ({ locale, outputs }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { ...LANDING_DEMO, task_outputs: outputs },
    ]))))
    await expect(getChatExample(LANDING_DEMO.id, locale)).resolves.toBeNull()
  })

  it("does not retain an example after the public query stops returning it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...LANDING_DEMO, task_outputs: landingSummaries.outputs }])))
      .mockResolvedValueOnce(new Response("[]"))
    vi.stubGlobal("fetch", fetchMock)
    expect(await getChatExample(LANDING_DEMO.id, "zh")).not.toBeNull()
    expect(await getChatExample(LANDING_DEMO.id, "zh")).toBeNull()
  })

  it.each(["http", "network"])("makes a failed %s availability check recoverable", async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", failure === "http"
      ? vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
      : vi.fn().mockRejectedValue(new Error("offline")))
    await expect(getChatExample(LANDING_DEMO.id, "zh")).resolves.toBeNull()
  })
})
