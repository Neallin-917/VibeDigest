import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommunityTemplates, type Task } from "./CommunityTemplates"

const clientState = vi.hoisted(() => ({ client: {} }))

vi.mock("@/lib/supabase", () => ({
    createClient: () => clientState.client,
}))

const tasks: Task[] = [
    {
        id: "example-1",
        video_url: "https://www.youtube.com/watch?v=example-1",
        video_title: "Leading example",
        thumbnail_url: "https://i.ytimg.com/vi/example-1/maxresdefault.jpg",
        status: "completed",
        created_at: "2026-07-30T00:00:00Z",
    },
    {
        id: "example-2",
        video_url: "https://www.youtube.com/watch?v=example-2",
        video_title: "Later example",
        thumbnail_url: "https://i.ytimg.com/vi/example-2/maxresdefault.jpg",
        status: "completed",
        created_at: "2026-07-29T00:00:00Z",
    },
]

const copy = {
    loading: "Loading",
    title: "Community examples",
    hint: "Try an example",
    unavailable: "Examples are temporarily unavailable.",
}

describe("CommunityTemplates", () => {
    afterEach(() => {
        clientState.client = {}
    })

    it("prioritizes only the leading thumbnail", () => {
        render(
            <CommunityTemplates
                initialTasks={tasks}
                limit={4}
                locale="en"
                copy={copy}
            />
        )

        const leadingImage = screen.getByRole("img", { name: "Leading example" })
        const laterImage = screen.getByRole("img", { name: "Later example" })

        expect(leadingImage).toHaveAttribute("loading", "eager")
        expect(leadingImage).toHaveAttribute("fetchpriority", "high")
        expect(laterImage).toHaveAttribute("loading", "lazy")
        expect(laterImage).toHaveAttribute("fetchpriority", "auto")
    })

    it("shows a concise status when the server could not load examples", () => {
        render(
            <CommunityTemplates
                initialStatus="unavailable"
                locale="en"
                copy={copy}
            />
        )

        expect(screen.getByRole("status")).toHaveTextContent(copy.unavailable)
    })

    it("shows the same status after the client fallback query fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
        const query = {
            select: vi.fn(),
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(),
        }
        query.select.mockReturnValue(query)
        query.eq.mockReturnValue(query)
        query.order.mockReturnValue(query)
        query.limit.mockResolvedValue({
            data: null,
            error: { message: "Data API unavailable" },
        })
        clientState.client = { from: vi.fn(() => query) }

        render(
            <CommunityTemplates
                limit={3}
                locale="en"
                copy={copy}
            />
        )

        expect(await screen.findByText(copy.unavailable)).toHaveAttribute("role", "status")
        consoleError.mockRestore()
    })
})
