import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CommunityTemplates, type SourceShelfItem, type Task } from "./CommunityTemplates"

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), pathname: "/en/explore" }))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}))

vi.mock("next/link", () => ({
  default: ({ href, onNavigate, onClick, scroll, ...props }: React.ComponentProps<typeof import("next/link").default>) => {
    void scroll
    return <a {...props} href={String(href)} onClick={(event) => {
      onClick?.(event)
      if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
        onNavigate?.({ preventDefault: () => event.preventDefault() })
      }
      event.preventDefault()
    }} />
  },
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

function gallery(overrides: Partial<React.ComponentProps<typeof CommunityTemplates>> = {}) {
  return (
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

function renderGallery(overrides: Partial<React.ComponentProps<typeof CommunityTemplates>> = {}) {
  return render(gallery(overrides))
}

describe("CommunityTemplates", () => {
  beforeEach(() => {
    navigation.replace.mockReset()
    navigation.push.mockReset()
    navigation.pathname = "/en/explore"
    window.history.replaceState({}, "", "/en/explore")
  })

  afterEach(() => vi.useRealTimers())

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

  it("keeps source filtering on the same page and preserves the search query", async () => {
    const user = userEvent.setup()
    renderGallery({ initialQuery: "agents" })
    await user.selectOptions(screen.getByRole("combobox", { name: "Browse by show" }), "latent-space")
    expect(navigation.push).toHaveBeenLastCalledWith("/en/explore?show=latent-space&q=agents", { scroll: false })
    await user.selectOptions(screen.getByRole("combobox", { name: "Browse by show" }), "all")
    expect(navigation.push).toHaveBeenLastCalledWith("/en/explore?q=agents", { scroll: false })
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

  it("preserves a newer draft when a delayed search response arrives", async () => {
    const view = renderGallery()
    const search = screen.getByRole("searchbox", { name: "Search content" })
    fireEvent.change(search, { target: { value: "AI" } })
    await waitFor(() => expect(navigation.replace).toHaveBeenLastCalledWith("/en/explore?q=AI", { scroll: false }))

    fireEvent.change(search, { target: { value: "AI agents" } })
    view.rerender(gallery({ initialQuery: "AI" }))
    expect(search).toHaveValue("AI agents")
    await waitFor(() => expect(navigation.replace).toHaveBeenLastCalledWith("/en/explore?q=AI+agents", { scroll: false }))
    view.rerender(gallery({ initialQuery: "AI agents" }))
    expect(search).toHaveValue("AI agents")

    view.rerender(gallery({ initialQuery: "AI" }))
    expect(search).toHaveValue("AI")
    view.rerender(gallery({ initialQuery: "research" }))
    expect(search).toHaveValue("research")
  })

  it("cancels an old search when a show is selected and uses that show for edits while navigation is pending", () => {
    vi.useFakeTimers()
    const view = renderGallery()
    const search = screen.getByRole("searchbox", { name: "Search content" })
    const source = screen.getByRole("combobox", { name: "Browse by show" })
    fireEvent.change(search, { target: { value: "AI" } })
    act(() => vi.advanceTimersByTime(100))
    fireEvent.change(source, { target: { value: "latent-space" } })
    expect(navigation.push).toHaveBeenLastCalledWith("/en/explore?show=latent-space&q=AI", { scroll: false })
    expect(source).toHaveValue("latent-space")
    act(() => vi.advanceTimersByTime(300))
    expect(navigation.replace).not.toHaveBeenCalled()

    fireEvent.change(search, { target: { value: "AI agents" } })
    act(() => vi.advanceTimersByTime(221))
    expect(navigation.replace).toHaveBeenLastCalledWith("/en/explore?show=latent-space&q=AI+agents", { scroll: false })
    view.rerender(gallery({ initialSource: "latent-space", initialQuery: "AI" }))
    expect(source).toHaveValue("latent-space")
    expect(search).toHaveValue("AI agents")
  })

  it("cancels the old route search for topic navigation and continues typing on the chosen topic", () => {
    vi.useFakeTimers()
    renderGallery()
    const search = screen.getByRole("searchbox", { name: "Search content" })
    fireEvent.change(search, { target: { value: "AI" } })
    act(() => vi.advanceTimersByTime(100))
    fireEvent.click(screen.getByRole("link", { name: "AI Agents" }))
    act(() => vi.advanceTimersByTime(300))
    expect(navigation.replace).not.toHaveBeenCalled()
    fireEvent.change(search, { target: { value: "AI coding" } })
    act(() => vi.advanceTimersByTime(221))
    expect(navigation.replace).toHaveBeenLastCalledWith("/en/topics/agents?q=AI+coding", { scroll: false })
  })

  it("cancels a pending search when clearing filters before the navigation returns", () => {
    vi.useFakeTimers()
    renderGallery({ initialSource: "latent-space", initialQuery: "AI" })
    const search = screen.getByRole("searchbox", { name: "Search content" })
    fireEvent.change(search, { target: { value: "new draft" } })
    act(() => vi.advanceTimersByTime(100))
    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }))
    act(() => vi.advanceTimersByTime(300))
    expect(navigation.replace).not.toHaveBeenCalled()
    expect(search).toHaveValue("")
    expect(screen.getByRole("combobox", { name: "Browse by show" })).toHaveValue("all")
  })

  it("does not replace an episode navigation with the pending search", () => {
    vi.useFakeTimers()
    renderGallery()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), { target: { value: "AI" } })
    act(() => vi.advanceTimersByTime(100))
    fireEvent.click(screen.getByRole("link", { name: "View digest: Leading example" }))
    act(() => vi.advanceTimersByTime(300))
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it("syncs browser back and forward even when the URL reuses a previous search", async () => {
    const view = renderGallery({ initialQuery: "AI" })
    const search = screen.getByRole("searchbox", { name: "Search content" })
    fireEvent.change(search, { target: { value: "agents" } })
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/en/explore?q=agents", { scroll: false }))
    view.rerender(gallery({ initialQuery: "agents" }))
    fireEvent.change(search, { target: { value: "unfinished draft" } })

    window.history.replaceState({}, "", "/en/explore?q=AI")
    fireEvent.popState(window)
    view.rerender(gallery({ initialQuery: "AI" }))
    expect(search).toHaveValue("AI")

    window.history.replaceState({}, "", "/en/explore?q=agents")
    fireEvent.popState(window)
    view.rerender(gallery({ initialQuery: "agents" }))
    expect(search).toHaveValue("agents")
  })

  it("preserves topic, filters, loaded page and the episode anchor in a detail return link", () => {
    navigation.pathname = "/en/topics/agents"
    renderGallery({ initialSource: "latent-space", initialQuery: "AI", currentPage: 3 })
    const link = screen.getByRole("link", { name: "View digest: Leading example" })
    const href = new URL(link.getAttribute("href")!, "https://vibedigest.invalid")
    expect(href.searchParams.get("from")).toBe("/en/topics/agents?show=latent-space&q=AI&page=3#episode-example-1")
    expect(screen.getByText("Leading example").closest("article")).toHaveAttribute("id", "episode-example-1")
    expect(screen.getByRole("link", { name: "AI Agents" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "All topics" })).toHaveAttribute("href", "/en/explore?q=AI")
  })

  it("opens the exact episode externally and the digest internally", () => {
    renderGallery({ initialSource: "latent-space", initialQuery: "AI" })

    expect(screen.getAllByRole("link", { name: "Original episode: Leading example" })[0]).toHaveAttribute(
      "href",
      tasks[0].video_url
    )
    expect(screen.getByRole("link", { name: "View digest: Leading example" })).toHaveAttribute(
      "href",
      "/en/tasks/example-1/Leading-example?from=%2Fen%2Fexplore%3Fshow%3Dlatent-space%26q%3DAI%23episode-example-1"
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
      "/zh/tasks/zh-only/Chinese-digest-only?from=%2Fen%2Fexplore%23episode-zh-only"
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
      "/en/tasks/unknown-locale/Leading-example?from=%2Fen%2Fexplore%23episode-unknown-locale"
    )
  })

  it("preserves the original library language and all filters when opening a digest in another language", () => {
    navigation.pathname = "/en/topics/agents"
    renderGallery({
      initialTasks: [{ ...tasks[0], takeawayLocale: "zh" }],
      initialSource: "latent-space",
      initialQuery: "AI",
      currentPage: 3,
    })
    const href = new URL(screen.getByRole("link", { name: "View digest: Leading example" }).getAttribute("href")!, "https://vibedigest.invalid")
    expect(href.pathname).toBe("/zh/tasks/example-1/Leading-example")
    expect(href.searchParams.get("from")).toBe("/en/topics/agents?show=latent-space&q=AI&page=3#episode-example-1")
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
      "/zh/tasks/compact-6/Compact-Chinese-digest?from=%2Fen%2Fexplore%23episode-compact-6"
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
