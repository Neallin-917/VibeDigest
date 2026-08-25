import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

type QueryError = {
    code: string
    message: string
    details: string
    hint: string
}

type QueryResult = {
    data: Array<Record<string, unknown>> | null
    error: QueryError | null
}

const queryState = vi.hoisted(() => ({
    result: {
        data: [],
        error: null,
    },
    eqCalls: [] as Array<[string, unknown]>,
}) as { result: QueryResult; eqCalls: Array<[string, unknown]> })

const fixtureMode = vi.hoisted(() => ({ enabled: false }))

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => {
        const query = {
            select: () => query,
            eq: (column: string, value: unknown) => {
                queryState.eqCalls.push([column, value])
                return query
            },
            order: () => query,
            limit: () => Promise.resolve(queryState.result),
        }

        return { from: () => query }
    },
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
    }: {
        initialStatus: string
        initialTasks: Array<{ video_title?: string; source?: { name: string } }>
    }) => (
        <>
            <div data-testid="community-status">
                {initialStatus}:{initialTasks.map(task => task.video_title).join(",")}
            </div>
            <div data-testid="community-sources">
                {initialTasks.map(task => task.source?.name ?? "").join(",")}
            </div>
        </>
    ),
}))

import { ServerCommunityTemplates } from "./ServerCommunityTemplates"

describe("ServerCommunityTemplates", () => {
    afterEach(() => {
        fixtureMode.enabled = false
        queryState.eqCalls = []
    })

    it("uses deterministic fixtures in local smoke mode", async () => {
        fixtureMode.enabled = true

        render(await ServerCommunityTemplates({ limit: 2, showHeader: false, locale: "en" }))

        expect(screen.getByTestId("community-status")).toHaveTextContent(
            "ready:From Prediction to Simulation: Teaching AI to Shape the Future,84 minutes of enterprise sales alpha | Jen Abel"
        )
    })

    it("marks the client state unavailable when the demo query fails", async () => {
        queryState.result = {
            data: null,
            error: {
                code: "42P01",
                message: "relation does not exist",
                details: "",
                hint: "",
            },
        }

        render(await ServerCommunityTemplates({ limit: 3, showHeader: false, locale: "en" }))

        expect(screen.getByTestId("community-status")).toHaveTextContent("unavailable")
    })

    it("keeps an empty but successful query distinguishable from an outage", async () => {
        queryState.result = { data: [], error: null }

        render(await ServerCommunityTemplates({ limit: 3, showHeader: false, locale: "en" }))

        expect(screen.getByTestId("community-status")).toHaveTextContent("ready")
        expect(queryState.eqCalls).toContainEqual(["task_outputs.kind", "summary"])
        expect(queryState.eqCalls).toContainEqual(["task_outputs.status", "completed"])
        expect(queryState.eqCalls).toContainEqual(["publication_status", "published"])
    })

    it("accepts PostgREST one-to-one podcast episode relations", async () => {
        queryState.result = {
            data: [{
                id: "task-1",
                video_url: "https://www.youtube.com/watch?v=episode",
                video_title: "A catalog episode",
                status: "completed",
                created_at: "2026-08-25T10:00:00Z",
                task_outputs: [{
                    kind: "summary",
                    status: "completed",
                    locale: "zh",
                    created_at: "2026-08-25T10:05:00Z",
                    content: {
                        version: 5,
                        language: "zh",
                        tl_dr: "摘要",
                        overview: "概览",
                        keypoints: [],
                    },
                }],
                podcast_episodes: {
                    source: {
                        slug: "latent-space",
                        name: "Latent Space",
                        source_url: "https://www.youtube.com/@LatentSpacePod",
                        aliases: [],
                        topics: ["agents"],
                        featured: true,
                        catalog_order: 1,
                    },
                },
            }],
            error: null,
        }

        render(await ServerCommunityTemplates({ limit: 3, showHeader: false, locale: "zh" }))

        expect(screen.getByTestId("community-sources")).toHaveTextContent("Latent Space")
    })
})
