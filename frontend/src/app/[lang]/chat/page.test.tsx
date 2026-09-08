import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import ChatPage, { generateMetadata } from "./page"
import { LANDING_DEMO } from "@/lib/landing-demo"

const getChatExamplesMock = vi.hoisted(() => vi.fn())
const getChatExampleMock = vi.hoisted(() => vi.fn())
const demoState = vi.hoisted(() => ({ enabled: false }))

vi.mock("@/lib/chat-examples", () => ({
  getChatExamples: getChatExamplesMock,
  getChatExample: getChatExampleMock,
}))

vi.mock("@/lib/local-ui-demo", () => ({
  isLocalUiDemo: () => demoState.enabled,
}))

describe("ChatPage", () => {
  beforeEach(() => {
    getChatExamplesMock.mockReset()
    getChatExampleMock.mockReset()
    demoState.enabled = false
  })

  it("keeps examples available when a fresh chat gains an ephemeral threadId", async () => {
    const examplesPromise = Promise.resolve([])
    getChatExamplesMock.mockReturnValue(examplesPromise)

    const page = await ChatPage({
      params: Promise.resolve({ lang: "en" }),
      searchParams: Promise.resolve({ threadId: "ephemeral-thread" }),
    })

    expect(getChatExamplesMock).toHaveBeenCalledTimes(1)
    expect(page.props.initialExamples).toBe(examplesPromise)
  })

  it("skips examples when a task is already selected", async () => {
    const page = await ChatPage({
      params: Promise.resolve({ lang: "en" }),
      searchParams: Promise.resolve({ task: "task-1", threadId: "thread-1" }),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(page.props.initialExamples).toBeNull()
  })

  it("loads only a verified public example for a direct task link", async () => {
    const publicExample = {
      id: "public-task",
      video_url: "https://www.youtube.com/watch?v=public-task",
      video_title: "Public digest",
    }
    getChatExampleMock.mockResolvedValue(publicExample)

    const page = await ChatPage({
      params: Promise.resolve({ lang: "en" }),
      searchParams: Promise.resolve({ task: "public-task" }),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(getChatExampleMock).toHaveBeenCalledWith("public-task")
    expect(page.props.publicExample).toEqual(publicExample)
  })

  it("skips the Supabase example request in the local visual demo", async () => {
    demoState.enabled = true

    const page = await ChatPage({
      params: Promise.resolve({ lang: "en" }),
      searchParams: Promise.resolve({}),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(page.props.initialExamples).toBeNull()
  })

  it("opens the pinned landing episode in the local visual demo without a remote lookup", async () => {
    demoState.enabled = true

    const page = await ChatPage({ params: Promise.resolve({ lang: "zh" }), searchParams: Promise.resolve({ task: LANDING_DEMO.id }) })

    expect(page.props.publicExample).toEqual(LANDING_DEMO)
    expect(getChatExampleMock).not.toHaveBeenCalled()
    expect(getChatExamplesMock).not.toHaveBeenCalled()
  })

  it("does not substitute the landing episode for another local task", async () => {
    demoState.enabled = true

    const page = await ChatPage({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({ task: "another-task" }) })

    expect(page.props.publicExample).toBeNull()
    expect(getChatExampleMock).not.toHaveBeenCalled()
  })

  it("offers recovery without mounting private chat when the pinned example is unavailable", async () => {
    getChatExampleMock.mockResolvedValue(null)

    const page = await ChatPage({ params: Promise.resolve({ lang: "zh" }), searchParams: Promise.resolve({ task: LANDING_DEMO.id }) })

    expect(getChatExampleMock).toHaveBeenCalledWith(LANDING_DEMO.id, "zh")
    expect(page.type).toBe("main")
    render(page)
    expect(screen.getByRole("heading", { name: "这个案例暂时无法打开。" })).toBeVisible()
    expect(screen.getByRole("link", { name: "新对话" })).toHaveAttribute("href", "/zh/chat")
    expect(screen.getByRole("link", { name: "重试" })).toHaveAttribute("href", `/zh/chat?task=${LANDING_DEMO.id}`)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it.each([false, true])("shows a language-unavailable state for a Japanese direct link (local demo: %s)", async (localDemo) => {
    demoState.enabled = localDemo
    const page = await ChatPage({ params: Promise.resolve({ lang: "ja" }), searchParams: Promise.resolve({ task: LANDING_DEMO.id }) })

    expect(getChatExampleMock).not.toHaveBeenCalled()
    expect(page.type).toBe("main")
    render(page)
    expect(screen.getByRole("heading", { name: "このサンプルには選択した言語の要約がありません。" })).toBeVisible()
    expect(screen.getByRole("link", { name: "新しいチャット" })).toHaveAttribute("href", "/ja/chat")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it.each(["en", "zh"])("checks the actual %s summary before opening the production landing example", async (lang) => {
    getChatExampleMock.mockResolvedValue(LANDING_DEMO)
    const page = await ChatPage({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({ task: LANDING_DEMO.id }) })

    expect(getChatExampleMock).toHaveBeenCalledWith(LANDING_DEMO.id, lang)
    expect(page.props.publicExample).toEqual(LANDING_DEMO)
  })

  it("leaves existing conversation restoration available when the public example is withdrawn", async () => {
    getChatExampleMock.mockResolvedValue(null)
    const page = await ChatPage({ params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({ task: LANDING_DEMO.id, threadId: "existing-thread" }) })

    expect(getChatExampleMock).not.toHaveBeenCalled()
    expect(page.props.publicExample).toBeNull()
  })

  it.each([
    ["en", "Chat", "Ask VibeDigest to process a source or answer questions grounded in it."],
    ["zh", "对话", "让 VibeDigest 整理来源内容，或回答基于来源的问题。"],
    ["ja", "チャット", "VibeDigest にソース整理や、ソースに基づく質問への回答を依頼できます。"],
  ])("generates %s metadata", async (locale, title, description) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: locale }) })

    expect(metadata.title).toBe(title)
    expect(metadata.description).toBe(description)
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("uses English metadata for an unsupported locale", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "fr" }) })

    expect(metadata.title).toBe("Chat")
    expect(metadata.description).toBe("Ask VibeDigest to process a source or answer questions grounded in it.")
  })
})
