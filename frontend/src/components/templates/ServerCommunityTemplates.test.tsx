import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

type QueryError = { code: string; message: string }
type QueryResult = {
  data: Array<Record<string, unknown>> | null
  count?: number | null
  error: QueryError | null
}

const queryState = vi.hoisted(() => ({
  tasks: { data: [], count: null, error: null } as QueryResult,
  sources: { data: [], error: null } as QueryResult,
  eqCalls: [] as Array<[string, unknown]>,
  limits: [] as number[],
}))
const fixtureMode = vi.hoisted(() => ({ enabled: false }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      let countOnly = false
      const query = {
        select: (_columns: string, options?: { head?: boolean }) => {
          countOnly = options?.head === true
          return query
        },
        eq: (column: string, value: unknown) => {
          queryState.eqCalls.push([column, value])
          return query
        },
        ilike: () => query,
        order: () => query,
        limit: (value: number) => {
          queryState.limits.push(value)
          return query
        },
        then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => {
          const result = table === "podcast_library_source_counts"
            ? queryState.sources
            : countOnly
              ? { ...queryState.tasks, data: null }
              : queryState.tasks
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    },
  }),
}))

vi.mock("@/lib/i18n-server", () => ({
  createTranslator: () => (key: string) => key,
}))
vi.mock("@/lib/local-ui-demo", () => ({
  shouldUseDemoFixtures: () => fixtureMode.enabled,
}))
vi.mock("./CommunityTemplates", () => ({
  CommunityTemplates: ({
    initialStatus,
    initialTasks,
    sourceItems = [],
    totalCount = 0,
  }: {
    initialStatus: string
    initialTasks: Array<{ video_title?: string; source?: { name: string }; takeaway?: string }>
    sourceItems?: Array<{ source: { name: string }; count: number }>
    totalCount?: number
  }) => (
    <>
      <div data-testid="community-status">
        {initialStatus}:{initialTasks.map((task) => task.video_title).join(",")}
      </div>
      <div data-testid="community-sources">
        {initialTasks.map((task) => task.source?.name ?? "").join(",")}
      </div>
      <div data-testid="community-takeaways">
        {initialTasks.map((task) => task.takeaway ?? "").join(",")}
      </div>
      <div data-testid="source-shelf">
        {sourceItems.map((item) => `${item.source.name}:${item.count}`).join(",")}
      </div>
      <div data-testid="total-count">{totalCount}</div>
    </>
  ),
}))

import { ServerCommunityTemplates } from "./ServerCommunityTemplates"

describe("ServerCommunityTemplates", () => {
  afterEach(() => {
    fixtureMode.enabled = false
    queryState.tasks = { data: [], count: null, error: null }
    queryState.sources = { data: [], error: null }
    queryState.eqCalls = []
    queryState.limits = []
  })

  it("uses only the requested fixture count for the landing preview", async () => {
    fixtureMode.enabled = true
    render(await ServerCommunityTemplates({
      limit: 2,
      layout: "landingPreview",
      showHeader: false,
      locale: "en",
    }))

    expect(screen.getByTestId("community-status")).toHaveTextContent(
      "ready:From Prediction to Simulation: Teaching AI to Shape the Future,84 minutes of enterprise sales alpha | Jen Abel"
    )
  })

  it("builds a source shelf from local fixtures instead of collapsing to all only", async () => {
    fixtureMode.enabled = true
    render(await ServerCommunityTemplates({ showHeader: false, locale: "en" }))

    expect(screen.getByTestId("source-shelf")).toHaveTextContent("Latent Space:1")
    expect(screen.getByTestId("source-shelf")).toHaveTextContent("Lenny's Podcast:1")
  })

  it("marks the client state unavailable when the public task query fails", async () => {
    queryState.tasks = {
      data: null,
      count: null,
      error: { code: "42P01", message: "relation does not exist" },
    }
    render(await ServerCommunityTemplates({ showHeader: false, locale: "en" }))
    expect(screen.getByTestId("community-status")).toHaveTextContent("unavailable")
  })

  it("queries only published completed demos and limits the first page", async () => {
    render(await ServerCommunityTemplates({ showHeader: false, locale: "en" }))

    expect(screen.getByTestId("community-status")).toHaveTextContent("ready")
    expect(queryState.eqCalls).toContainEqual(["is_demo", true])
    expect(queryState.eqCalls).toContainEqual(["status", "completed"])
    expect(queryState.eqCalls).toContainEqual(["publication_status", "published"])
    expect(queryState.limits).toContain(18)
  })

  it("maps projected fields, source relations, and aggregated source counts", async () => {
    const source = {
      slug: "latent-space",
      name: "Latent Space",
      source_url: "https://www.youtube.com/@LatentSpacePod",
      aliases: [],
      topics: ["agents"],
      featured: true,
      catalog_order: 1,
    }
    queryState.sources = { data: [{ ...source, published_count: 12 }], error: null }
    queryState.tasks = {
      data: [{
        id: "task-1",
        video_url: "https://www.youtube.com/watch?v=episode",
        video_title: "A catalog episode",
        status: "completed",
        created_at: "2026-08-25T10:00:00Z",
        public_takeaway: "A small projected takeaway.",
        public_keypoint_count: 6,
        podcast_episodes: { source },
      }],
      count: 1,
      error: null,
    }

    render(await ServerCommunityTemplates({ showHeader: false, locale: "zh" }))

    expect(screen.getByTestId("community-sources")).toHaveTextContent("Latent Space")
    expect(screen.getByTestId("community-takeaways")).toHaveTextContent("projected takeaway")
    expect(screen.getByTestId("source-shelf")).toHaveTextContent("Latent Space:12")
    expect(screen.getByTestId("total-count")).toHaveTextContent("1")
  })
})
