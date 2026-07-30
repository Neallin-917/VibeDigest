import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CommunityTemplates, type Task } from "./CommunityTemplates"

vi.mock("@/lib/supabase", () => ({
    createClient: () => ({}),
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
}

describe("CommunityTemplates", () => {
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
})
