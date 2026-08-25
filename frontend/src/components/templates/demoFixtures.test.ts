import { describe, expect, it } from "vitest"
import { parseCurrentSummary } from "@/lib/summary-contract"
import { getDemoFixtureTask } from "./demoFixtures"

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
})
