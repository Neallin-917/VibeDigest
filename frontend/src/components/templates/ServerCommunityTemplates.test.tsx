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
}) as { result: QueryResult })

const fixtureMode = vi.hoisted(() => ({ enabled: false }))

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => {
        const query = {
            select: () => query,
            eq: () => query,
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
        initialTasks: Array<{ video_title?: string }>
    }) => (
        <div data-testid="community-status">
            {initialStatus}:{initialTasks.map(task => task.video_title).join(",")}
        </div>
    ),
}))

import { ServerCommunityTemplates } from "./ServerCommunityTemplates"

describe("ServerCommunityTemplates", () => {
    afterEach(() => {
        fixtureMode.enabled = false
    })

    it("uses deterministic fixtures in local smoke mode", async () => {
        fixtureMode.enabled = true

        render(await ServerCommunityTemplates({ limit: 2, showHeader: false, locale: "en" }))

        expect(screen.getByTestId("community-status")).toHaveTextContent(
            "ready:How AI shortens the feedback loop,State of the Claw — Peter Steinberger"
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
    })
})
