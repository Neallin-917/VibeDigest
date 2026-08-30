import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: undefined,
    NEXT_PUBLIC_BASE_URL: undefined,
    FRONTEND_URL: undefined,
  },
}))

const supabaseMocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.limit = vi.fn()
  return {
    from: vi.fn(() => query),
    query,
  }
})

vi.mock("@/lib/supabase-public", () => ({
  supabasePublic: { from: supabaseMocks.from },
}))

import sitemap, { buildSitemapEntries, STATIC_SITEMAP_PATHS } from "./sitemap"
import robots from "./robots"

describe("public discovery metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMocks.query.select.mockImplementation(() => supabaseMocks.query)
    supabaseMocks.query.eq.mockImplementation(() => supabaseMocks.query)
    supabaseMocks.query.order.mockImplementation(() => supabaseMocks.query)
    supabaseMocks.query.limit.mockResolvedValue({ data: [], error: null })
  })

  it("queries only database-qualified completed public tasks with completed summaries", async () => {
    await sitemap()

    expect(supabaseMocks.from).toHaveBeenCalledWith("tasks")
    expect(supabaseMocks.query.select).toHaveBeenCalledWith(
      "id, created_at, updated_at, published_at, video_title, public_quality_flags, task_outputs!inner(kind, status, updated_at, locale)",
    )
    expect(supabaseMocks.query.eq.mock.calls).toEqual(expect.arrayContaining([
      ["status", "completed"],
      ["is_demo", true],
      ["publication_status", "published"],
      ["task_outputs.kind", "summary"],
      ["task_outputs.status", "completed"],
    ]))
    expect(supabaseMocks.query.limit).toHaveBeenCalledWith(1000)
  })

  it("propagates a public task query failure instead of publishing an empty dynamic sitemap", async () => {
    const queryError = new Error("database unavailable")
    supabaseMocks.query.limit.mockResolvedValue({ data: null, error: queryError })

    await expect(sitemap()).rejects.toThrow("Failed to load public sitemap tasks")
  })

  it("builds deterministic canonical localized entries and uses the latest task update", () => {
    const entries = buildSitemapEntries([{
      id: "task-123",
      video_title: "Agent Systems in Production",
      created_at: "2026-08-28T08:00:00.000Z",
      published_at: "2026-08-29T09:00:00.000Z",
      updated_at: "2026-08-30T10:00:00.000Z",
      task_outputs: [
        {
          kind: "summary",
          status: "completed",
          updated_at: "2026-08-30T10:00:00.000Z",
          locale: "en",
        },
      ],
    }])

    expect(entries).toHaveLength(STATIC_SITEMAP_PATHS.length * 3 + 1)
    const englishTask = entries.find((entry) => entry.url.includes("/en/tasks/task-123/"))
    expect(englishTask).toMatchObject({
      url: "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
      lastModified: new Date("2026-08-30T10:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: {
        languages: {
          en: "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
          "x-default": "https://vibedigest.io/en/tasks/task-123/Agent-Systems-in-Production",
        },
      },
    })
    expect(entries.find((entry) => entry.url.includes("/zh/tasks/task-123/"))).toBeUndefined()
    expect(entries.some((entry) => entry.url.includes("transcript"))).toBe(false)
    expect(entries.some((entry) => entry.url.includes("/chat"))).toBe(false)
  })

  it("uses a newer publication time when updated_at was not advanced", () => {
    const entries = buildSitemapEntries([{
      id: "task-123",
      video_title: "Agent Systems in Production",
      created_at: "2026-08-27T08:00:00.000Z",
      updated_at: "2026-08-28T08:00:00.000Z",
      published_at: "2026-08-30T08:00:00.000Z",
      task_outputs: [
        {
          kind: "summary",
          status: "completed",
          updated_at: "2026-08-29T08:00:00.000Z",
          locale: "en",
        },
      ],
    }])

    const taskEntry = entries.find((entry) => entry.url.includes("/en/tasks/task-123/"))
    expect(taskEntry?.lastModified).toEqual(new Date("2026-08-30T08:00:00.000Z"))
  })

  it("uses the latest completed summary update when task timestamps were not advanced", () => {
    const entries = buildSitemapEntries([{
      id: "task-123",
      video_title: "Agent Systems in Production",
      created_at: "2026-08-27T08:00:00.000Z",
      updated_at: "2026-08-28T08:00:00.000Z",
      published_at: "2026-08-29T08:00:00.000Z",
      task_outputs: [
        {
          kind: "summary",
          status: "completed",
          updated_at: "2026-08-30T08:00:00.000Z",
          locale: "en",
        },
        { kind: "summary", status: "completed", updated_at: "invalid", locale: "zh" },
      ],
      public_quality_flags: { language: "en" },
    }])

    const taskEntry = entries.find((entry) => entry.url.includes("/en/tasks/task-123/"))
    expect(taskEntry?.lastModified).toEqual(new Date("2026-08-30T08:00:00.000Z"))
  })

  it("orders bilingual task alternates with English as the default locale", () => {
    const entries = buildSitemapEntries([{
      id: "task-bilingual",
      video_title: "Bilingual digest",
      created_at: "2026-08-30T08:00:00.000Z",
      updated_at: "2026-08-30T08:00:00.000Z",
      published_at: "2026-08-30T08:00:00.000Z",
      task_outputs: [
        { kind: "summary", status: "completed", updated_at: null, locale: "zh" },
        { kind: "summary", status: "completed", updated_at: null, locale: "en" },
      ],
    }])

    const taskEntries = entries.filter((entry) => entry.url.includes("/tasks/task-bilingual/"))
    expect(taskEntries.map((entry) => entry.url)).toEqual([
      "https://vibedigest.io/en/tasks/task-bilingual/Bilingual-digest",
      "https://vibedigest.io/zh/tasks/task-bilingual/Bilingual-digest",
    ])
    expect(taskEntries[0]?.alternates?.languages?.["x-default"]).toBe(
      "https://vibedigest.io/en/tasks/task-bilingual/Bilingual-digest"
    )
  })

  it("keeps crawler discovery on public pages and blocks application endpoints", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      sitemap: "https://vibedigest.io/sitemap.xml",
    })
  })
})
