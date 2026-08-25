import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockFrom, mockTaskSingle, mockOutputsResult } = vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockTaskSingle: vi.fn(),
    mockOutputsResult: vi.fn(),
}))

vi.mock("@/lib/supabase-server", () => ({
    createClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { GET } from "./route"

function taskBuilder() {
    return {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mockTaskSingle })),
        })),
    }
}

function outputsBuilder() {
    return {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                in: vi.fn(() => ({
                    eq: mockOutputsResult,
                })),
            })),
        })),
    }
}

const taskId = "1990b8c8-2ec7-4a9c-ae34-0c75ca81fe4d"

describe("GET /api/tasks/[id]/transcript", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFrom.mockImplementation((table: string) => table === "tasks" ? taskBuilder() : outputsBuilder())
        mockTaskSingle.mockResolvedValue({ data: { id: taskId, status: "completed" }, error: null })
    })

    it("rejects malformed task IDs before querying the database", async () => {
        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: "not-a-uuid" }),
        })

        expect(response.status).toBe(400)
        expect(mockFrom).not.toHaveBeenCalled()
    })

    it("returns normalized timestamped segments for an accessible completed task", async () => {
        mockOutputsResult.mockResolvedValue({
            data: [{
                kind: "script_raw",
                content: JSON.stringify({
                    language: "en",
                    segments: [{ start: 12.9, end: 18, text: "  First segment  " }],
                }),
            }],
            error: null,
        })

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: taskId }),
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get("Cache-Control")).toBe("private, max-age=300")
        expect(body).toEqual({
            language: "en",
            segments: [{ start: 12.9, end: 18, text: "First segment" }],
        })
    })

    it("does not expose tasks hidden by row-level security", async () => {
        mockTaskSingle.mockResolvedValue({
            data: null,
            error: { code: "PGRST116", message: "not found" },
        })

        const response = await GET(new Request("http://localhost"), {
            params: Promise.resolve({ id: taskId }),
        })

        expect(response.status).toBe(404)
        expect(mockOutputsResult).not.toHaveBeenCalled()
    })
})
