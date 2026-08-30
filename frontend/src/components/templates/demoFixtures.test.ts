import { describe, expect, it } from "vitest"
import { parseCurrentSummary } from "@/lib/summary-contract"
import { getDemoFixtureTask, getDemoFixtureTasks } from "./demoFixtures"

describe("demoFixtures", () => {
    it("provides a readable localized detail payload for local podcast cards", () => {
        const task = getDemoFixtureTask("local-demo-latent-space", "zh")
        const summaryOutput = task?.task_outputs?.find((output) => output.kind === "summary")

        expect(task?.status).toBe("completed")
        expect(summaryOutput?.locale).toBe("zh")
        expect(parseCurrentSummary(summaryOutput?.content)?.keypoints).toHaveLength(2)
    })

    it("does not invent a fixture for an unknown task id", () => {
        expect(getDemoFixtureTask("missing", "en")).toBeNull()
    })

    it("keeps local demo cards self-contained and source-aware", () => {
        const tasks = getDemoFixtureTasks(10)

        expect(tasks).toHaveLength(10)
        for (const task of tasks) {
            expect(task.source?.id).toBeTruthy()
            expect(task.thumbnail_url).toMatch(/^data:image\/svg\+xml/)
            expect(task.thumbnail_url).not.toContain("i.ytimg.com")
        }
    })

    it("does not duplicate words while wrapping thumbnail titles", () => {
        const task = getDemoFixtureTask("local-demo-latent-space", "en")
        const svg = decodeURIComponent(task?.thumbnail_url || "")

        expect(svg).not.toContain("Future Future")
    })
})
