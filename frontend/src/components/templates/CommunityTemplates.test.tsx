import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CommunityTemplates, type Task } from "./CommunityTemplates"

const tasks: Task[] = [
    {
        id: "example-1",
        video_url: "https://www.youtube.com/watch?v=example-1",
        video_title: "Leading example",
        thumbnail_url: "https://i.ytimg.com/vi/example-1/maxresdefault.jpg",
        author: "Latent Space",
        status: "completed",
        created_at: "2026-07-30T00:00:00Z",
    },
    {
        id: "example-2",
        video_url: "https://www.youtube.com/watch?v=example-2",
        video_title: "Later example",
        thumbnail_url: "https://i.ytimg.com/vi/example-2/maxresdefault.jpg",
        author: "Lenny's Podcast",
        status: "completed",
        created_at: "2026-07-29T00:00:00Z",
    },
    {
        id: "example-3",
        video_url: "https://www.youtube.com/watch?v=example-3",
        video_title: "Third example",
        thumbnail_url: "https://i.ytimg.com/vi/example-3/maxresdefault.jpg",
        author: "Every",
        status: "completed",
        created_at: "2026-07-28T00:00:00Z",
    },
    {
        id: "example-4",
        video_url: "https://www.youtube.com/watch?v=example-4",
        video_title: "Fourth example",
        thumbnail_url: "https://i.ytimg.com/vi/example-4/maxresdefault.jpg",
        author: "a16z",
        status: "completed",
        created_at: "2026-07-27T00:00:00Z",
    },
]

const copy = {
    loading: "Loading",
    title: "Community examples",
    hint: "Try an example",
    unavailable: "Examples are temporarily unavailable.",
}

describe("CommunityTemplates", () => {
    beforeEach(() => {
        window.history.replaceState(null, "", "/en/explore")
    })

    afterEach(() => {
        window.history.replaceState(null, "", "/en/explore")
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
        expect(leadingImage.closest("a")).toHaveClass("aspect-video")
        expect(screen.getByText("Leading example")).toHaveClass("line-clamp-2")
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

    it("renders a four-column landing preview from podcast sources", () => {
        const { container } = render(
            <CommunityTemplates
                initialTasks={tasks}
                limit={4}
                layout="landingPreview"
                locale="en"
                copy={copy}
            />
        )

        expect(screen.getByText("Fourth example")).toBeInTheDocument()
        expect(container.querySelector(".grid")).toHaveClass("lg:grid-cols-3", "xl:grid-cols-4")
    })

    it("filters the curated episodes by source", async () => {
        const user = userEvent.setup()
        render(
            <CommunityTemplates
                initialTasks={tasks}
                locale="en"
                copy={copy}
            />
        )

        await user.click(screen.getByRole("button", { name: /Latent Space/ }))

        expect(screen.getByText("Leading example")).toBeInTheDocument()
        expect(screen.queryByText("Later example")).not.toBeInTheDocument()
        expect(window.location.search).toBe("?show=latent-space")

        const resultsSection = screen.getByRole("heading", { name: "Ready to read" }).parentElement
        const resultsGrid = resultsSection?.querySelector(".grid")
        expect(resultsGrid).toHaveClass("max-w-[21rem]")
        expect(resultsGrid).not.toHaveClass("bg-slate-200", "border")
    })

    it("opens the exact episode instead of the source channel", () => {
        render(<CommunityTemplates initialTasks={tasks} locale="en" copy={copy} />)

        const links = screen.getAllByRole("link", { name: /Original episode/ })
        expect(links[0]).toHaveAttribute("href", tasks[0].video_url)
        expect(links[0]).toHaveAttribute("target", "_blank")
        expect(links[0]).toHaveAttribute("rel", "noopener noreferrer")
    })

    it("keeps source and search state in the URL without leaving the library", async () => {
        const user = userEvent.setup()
        render(<CommunityTemplates initialTasks={tasks} locale="en" copy={copy} />)

        await user.click(screen.getByRole("button", { name: /Latent Space/ }))
        await user.type(screen.getByRole("searchbox", { name: "Search content" }), "missing topic")

        expect(window.location.search).toBe("?show=latent-space&q=missing+topic")
        expect(screen.getByRole("status")).toHaveTextContent("No finished digests match this filter yet.")

        await user.click(screen.getByRole("button", { name: "Clear filters" }))

        expect(window.location.search).toBe("")
        expect(screen.getByText("Leading example")).toBeInTheDocument()
        expect(screen.getByRole("searchbox", { name: "Search content" })).toHaveValue("")
    })

    it("hydrates source and search state from the URL props", () => {
        window.history.replaceState(null, "", "/en/explore?show=a16z&q=Fourth")

        render(
            <CommunityTemplates
                initialTasks={tasks}
                locale="en"
                copy={copy}
                initialSource="a16z"
                initialQuery="Fourth"
            />
        )

        expect(screen.getByRole("button", { name: /a16z/ })).toHaveAttribute("aria-pressed", "true")
        expect(screen.getByRole("searchbox", { name: "Search content" })).toHaveValue("Fourth")
        expect(screen.getByText("Fourth example")).toBeInTheDocument()
        expect(screen.queryByText("Leading example")).not.toBeInTheDocument()
        expect(screen.getByRole("link", { name: "View digest" })).toHaveAttribute(
            "href",
            "/en/tasks/example-4/Fourth-example?fromShow=a16z&fromQuery=Fourth"
        )
    })

    it("puts source browsing before finished output", () => {
        render(<CommunityTemplates initialTasks={tasks} locale="en" copy={copy} />)

        const readyHeading = screen.getByRole("heading", { name: "Ready to read" })
        const sourceHeading = screen.getByRole("heading", { name: "Browse by show" })

        expect(sourceHeading.compareDocumentPosition(readyHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy()
    })

    it("places search beside the library intro while keeping show filters first-level", () => {
        const { container } = render(
            <CommunityTemplates
                initialTasks={tasks}
                locale="en"
                copy={copy}
                showHeader={false}
                intro={{
                    eyebrow: "VibeDigest Agent output",
                    title: "Podcasts, already organized",
                    description: "Open a finished digest.",
                }}
            />
        )

        const header = container.querySelector("header")
        const searchbox = screen.getByRole("searchbox", { name: "Search content" })
        const sourceHeading = screen.getByRole("heading", { name: "Browse by show" })

        expect(header).toContainElement(searchbox)
        expect(header).toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(20rem,36rem)]")
        expect(header?.compareDocumentPosition(sourceHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy()
        expect(screen.getAllByRole("searchbox")).toHaveLength(1)
    })

    it("reveals every source with finished content and hides empty tracked sources", async () => {
        const user = userEvent.setup()
        const tasksWithAnthropic: Task[] = [
            ...tasks,
            {
                ...tasks[0],
                id: "example-no-priors",
                video_title: "No Priors example",
                author: "No Priors",
            },
            {
                ...tasks[0],
                id: "example-anthropic",
                video_title: "Anthropic example",
                author: "Anthropic",
            },
        ]
        render(<CommunityTemplates initialTasks={tasksWithAnthropic} locale="en" copy={copy} />)

        await user.click(screen.getByRole("button", { name: "Browse all shows" }))

        expect(screen.getByRole("button", { name: /Anthropic/ })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /The MAD Podcast/ })).not.toBeInTheDocument()
    })

    it("renders a database-backed source without adding it to the frontend catalog", () => {
        const dynamicTask: Task = {
            ...tasks[0],
            id: "dynamic-source-task",
            author: "Database Author",
            source: {
                id: "new-ai-show",
                name: "New AI Show",
                channelUrl: "https://www.youtube.com/@NewAIShow",
                aliases: ["new ai show"],
                topics: ["agents"],
                featured: true,
                order: 1,
            },
        }

        render(<CommunityTemplates initialTasks={[dynamicTask]} locale="en" copy={copy} />)

        expect(screen.getByRole("button", { name: /New AI Show/ })).toBeInTheDocument()
        expect(screen.getAllByText("New AI Show")).toHaveLength(2)
        expect(screen.getByRole("link", { name: "Original episode" })).toHaveAttribute(
            "href",
            dynamicTask.video_url
        )
    })

    it("reveals more finished episodes without navigating away", async () => {
        const user = userEvent.setup()
        const manyTasks = Array.from({ length: 12 }, (_, index) => ({
            ...tasks[index % tasks.length],
            id: `many-${index}`,
            video_title: `Episode ${index + 1}`,
        }))
        render(<CommunityTemplates initialTasks={manyTasks} locale="en" copy={copy} />)

        expect(screen.queryByText("Episode 11")).not.toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "Load more" }))

        expect(screen.getByText("Episode 11")).toBeInTheDocument()
        expect(screen.getByText("Episode 12")).toBeInTheDocument()
    })
})
