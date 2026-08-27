import { describe, expect, it } from "vitest"

import { GET } from "./route"

describe("GET /api/tasks/[id]/transcript", () => {
    it("does not expose transcript content", async () => {
        const response = await GET()

        expect(response.status).toBe(404)
        expect(response.headers.get("Cache-Control")).toBe("no-store")
        expect(await response.json()).toEqual({ error: "Not found" })
    })
})
