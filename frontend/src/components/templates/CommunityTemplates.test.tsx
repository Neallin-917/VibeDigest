import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CommunityTemplates, type SourceShelfItem, type Task } from "./CommunityTemplates"

const navigation = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/explore",
  useRouter: () => ({ replace: navigation.replace }),
}))

const sources: SourceShelfItem[] = [
  {
    source: {
      id: "latent-space",
      name: "Latent Space",
      channelUrl: "https://www.youtube.com/@LatentSpacePod",
      avatarUrl: "https://yt3.googleusercontent.com/example-avatar=s900-c-k-c0x00ffffff-no-rj",
      aliases: ["latent space"],
      topics: ["agents"],
      featured: true,
      order: 1,
    },
    count: 8,
  },
  {
    source: {
      id: "lennys-podcast",
      name: "Lenny's Podcast",
      channelUrl: "https://www.youtube.com/@LennysPodcast",
      aliases: ["lenny's podcast"],
      topics: ["product"],
      featured: true,
      order: 2,
    },
    count: 5,
  },
]

const tasks: Task[] = [
  {
    id: "example-1",
    video_url: "https://www.youtube.com/watch?v=example-1",
    video_title: "Leading example",
    thumbnail_url: "https://i.ytimg.com/vi/example-1/maxresdefault.jpg",
    author: "Latent Space",
    status: "completed",
    created_at: "2026-07-30T00:00:00Z",
    takeaway: "The leading takeaway is already prepared.",
    takeawayLocale: "en",
    keyPointCount: 8,
    source: sources[0].source,
  },
  {
    id: "example-2",
    video_url: "https://www.youtube.com/watch?v=example-2",
    video_title: "Later example",
    thumbnail_url: "https://i.ytimg.com/vi/example-2/maxresdefault.jpg",
    author: "Lenny's Podcast",
    status: "completed",
    created_at: "2026-07-29T00:00:00Z",
    takeaway: "A second concise takeaway.",
    takeawayLocale: "en",
    keyPointCount: 6,
    source: sources[1].source,
  },
]

const copy = {
  loading: "Loading",
  title: "Community examples",
  hint: "Try an example",
  unavailable: "Examples are temporarily unavailable.",
}

function renderGallery(overrides: Partial<React.ComponentProps<typeof CommunityTemplates>> = {}) {
  return render(
    <CommunityTemplates
      initialTasks={tasks}
      sourceItems={sources}
      totalCount={13}
      locale="en"
      copy={copy}
      intro={{
        eyebrow: "VibeDigest Agent output",
        title: "Podcasts, already organized",
        description: "Open a finished digest.",
      }}
      {...overrides}
    />
  )
}

describe("CommunityTemplates", () => {
  beforeEach(() => {
    navigation.replace.mockReset()
  })

  it("prioritizes only the leading thumbnail and supplies responsive image sizes", () => {
    const { container } = renderGallery()

    const [leadingImage, laterImage] = Array.from(container.querySelectorAll("[data-card-role] img"))
    expect(leadingImage).toHaveAttribute("loading", "eager")
    expect(leadingImage).toHaveAttribute("fetchpriority", "high")
    expect(leadingImage).toHaveAttribute("sizes")
    expect(laterImage).toHaveAttribute("loading", "lazy")
    expect(leadingImage).toHaveAttribute("alt", "")
  })

  it("falls back to the source initial when a remote avatar fails", () => {
    const { container } = renderGallery()
    const sourceMark = container.querySelector<HTMLElement>("[data-source-mark='latent-space']")
    const avatar = sourceMark?.querySelector("img")

    expect(sourceMark).not.toBeNull()
    expect(avatar).not.toBeNull()
    fireEvent.error(avatar!)

    expect(sourceMark?.querySelector("img")).toBeNull()
    expect(sourceMark).toHaveTextContent("L")
  })

  it("shows a concise status when the server could not load examples", () => {
    renderGallery({ initialStatus: "unavailable" })
    expect(screen.getByRole("status")).toHaveTextContent(copy.unavailable)
  })

  it("keeps the landing preview dense and symmetrical", () => {
    const previewTasks = Array.from({ length: 4 }, (_, index) => ({
      ...tasks[index % tasks.length],
      id: `preview-${index}`,
      video_title: `Preview ${index + 1}`,
    }))
    const { container } = renderGallery({
      initialTasks: previewTasks,
      layout: "landingPreview",
      intro: undefined,
    })

    expect(screen.getByText("Preview 4")).toBeInTheDocument()
    expect(container.querySelector(".grid")).toHaveClass("sm:grid-cols-2", "xl:grid-cols-4")
  })

  it("keeps source filtering on the same page and preserves the search query", () => {
    renderGallery({ initialQuery: "agents" })

    expect(screen.getByRole("link", { name: /Latent Space/ })).toHaveAttribute(
      "href",
      "/en/explore?show=latent-space&q=agents"
    )
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/en/explore?q=agents"
    )
  })

  it("debounces search into a server-rendered URL without adding a workflow step", async () => {
    const user = userEvent.setup()
    renderGallery()
    await user.type(screen.getByRole("searchbox", { name: "Search content" }), "simulation")

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenLastCalledWith(
        "/en/explore?q=simulation",
        { scroll: false }
      )
    })
  })

  it("opens the exact episode externally and the digest internally", () => {
    renderGallery({ initialSource: "latent-space", initialQuery: "AI" })

    expect(screen.getAllByRole("link", { name: "Original episode: Leading example" })[0]).toHaveAttribute(
      "href",
      tasks[0].video_url
    )
    expect(screen.getByRole("link", { name: "View digest: Leading example" })).toHaveAttribute(
      "href",
      "/en/tasks/example-1/Leading-example?fromShow=latent-space&fromQuery=AI"
    )
  })

  it("hides a mismatched takeaway and routes the card to the supported digest locale", () => {
    const mismatchTask: Task = {
      ...tasks[0],
      id: "zh-only",
      video_title: "Chinese digest only",
      takeaway: "这是一段中文摘要。",
      takeawayLocale: "zh",
    }

    renderGallery({ initialTasks: [mismatchTask], totalCount: 1 })

    expect(screen.queryByText("这是一段中文摘要。")).not.toBeInTheDocument()
    expect(screen.getByText("Digest available in Chinese.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View digest: Chinese digest only" })).toHaveAttribute(
      "href",
      "/zh/tasks/zh-only/Chinese-digest-only"
    )
  })

  it("fails closed when a projected takeaway has no trusted locale", () => {
    const unknownLocaleTask: Task = {
      ...tasks[0],
      id: "unknown-locale",
      takeaway: "Potentially mismatched projected text.",
      takeawayLocale: null,
    }

    renderGallery({ initialTasks: [unknownLocaleTask], totalCount: 1 })

    expect(screen.queryByText("Potentially mismatched projected text.")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View digest: Leading example" })).toHaveAttribute(
      "href",
      "/en/tasks/unknown-locale/Leading-example"
    )
  })

  it("applies the same language guard to compact library rows", () => {
    const compactTasks = Array.from({ length: 7 }, (_, index) => ({
      ...tasks[index % tasks.length],
      id: `compact-${index}`,
      video_title: `Compact episode ${index + 1}`,
    }))
    compactTasks[6] = {
      ...compactTasks[6],
      video_title: "Compact Chinese digest",
      takeaway: "不应出现在英文列表的中文摘要。",
      takeawayLocale: "zh",
    }

    renderGallery({ initialTasks: compactTasks, totalCount: compactTasks.length })

    expect(screen.queryByText("不应出现在英文列表的中文摘要。")).not.toBeInTheDocument()
    expect(screen.getByText("Digest available in Chinese.")).toBeInTheDocument()
    expect(screen.getByText("Compact Chinese digest").closest("a")).toHaveAttribute(
      "href",
      "/zh/tasks/compact-6/Compact-Chinese-digest"
    )
  })

  it("uses one digest link and one explicitly named source link per feature card", () => {
    const { container } = renderGallery()
    const leadingCard = screen.getByText("Leading example").closest("article")

    expect(leadingCard).not.toBeNull()
    expect(leadingCard?.querySelectorAll("a")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "View digest: Leading example" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Original episode: Leading example" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    )
    expect(container.querySelector("[data-card-role] [data-slot='episode-card-media']")).not.toHaveAttribute("href")
  })

  it("uses a full-width horizontal result when a filter has only one item", () => {
    const { container } = renderGallery({ initialTasks: [tasks[0]], totalCount: 1 })

    expect(container.querySelector(".lg\\:col-span-12")).toBeInTheDocument()
    expect(screen.getByText("Leading example").closest("article")).toHaveClass(
      "lg:grid",
      "lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]"
    )
  })

  it("uses intrinsic editorial roles so extra height expands media instead of the hero content", () => {
    const editorialTasks = Array.from({ length: 6 }, (_, index) => ({
      ...tasks[index % tasks.length],
      id: `editorial-${index}`,
      video_title: `Editorial episode ${index + 1}`,
    }))
    const { container } = renderGallery({ initialTasks: editorialTasks, totalCount: 6 })

    expect(container.querySelector("[data-feature-layout='editorial']")).toBeInTheDocument()
    expect(container.querySelectorAll("[data-card-role='hero']")).toHaveLength(1)
    expect(container.querySelectorAll("[data-card-role='supporting']")).toHaveLength(2)
    expect(container.querySelectorAll("[data-card-role='standard']")).toHaveLength(3)
    expect(container.querySelector(".lg\\:row-span-2")).not.toBeInTheDocument()

    const hero = container.querySelector("[data-card-role='hero']")
    const heroMedia = hero?.querySelector("[data-slot='episode-card-media']")
    const heroContent = hero?.querySelector("[data-slot='episode-card-content']")
    const heroFooter = hero?.querySelector("[data-slot='episode-card-footer']")
    const supportingMedia = container.querySelector(
      "[data-card-role='supporting'] [data-slot='episode-card-media']"
    )
    expect(hero).toHaveClass("lg:grid-rows-[minmax(0,1fr)_auto]")
    expect(hero).toHaveClass("sm:min-h-[25rem]")
    expect(hero).not.toHaveClass("min-h-[25rem]")
    expect(heroMedia).toHaveClass("aspect-[16/9]", "sm:aspect-[1.38/1]", "lg:aspect-[1.55/1]")
    expect(heroContent).toHaveClass("lg:flex-none")
    expect(heroFooter).toHaveClass("mt-4")
    expect(heroFooter).not.toHaveClass("mt-auto")
    expect(supportingMedia).toHaveClass("lg:aspect-[5/2]")
  })

  it("keeps mature legacy output visible when it has no catalog source relation", () => {
    const legacyTask: Task = {
      ...tasks[0],
      id: "legacy-output",
      author: "Independent AI Show",
      source: undefined,
      video_title: "Legacy mature output",
    }
    renderGallery({ initialTasks: [legacyTask], totalCount: 1 })

    expect(screen.getByText("Legacy mature output")).toBeInTheDocument()
    expect(screen.getByText("Independent AI Show")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Original episode: Legacy mature output" })).toHaveAttribute(
      "href",
      legacyTask.video_url
    )
  })

  it("shows an editorial lead plus a compact two-column feed for a large inventory", () => {
    const manyTasks = Array.from({ length: 18 }, (_, index) => ({
      ...tasks[index % tasks.length],
      id: `many-${index}`,
      video_title: `Episode ${index + 1}`,
    }))
    const { container } = renderGallery({ initialTasks: manyTasks, totalCount: 43, hasMore: true })

    expect(screen.getByText("Episode 18")).toBeInTheDocument()
    expect(container.querySelectorAll("[class*='content-visibility:auto']")).toHaveLength(12)
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/en/explore?page=2"
    )
  })
})
