import { beforeEach, describe, expect, it, vi } from "vitest"
import ChatPage from "./page"

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
      searchParams: Promise.resolve({ threadId: "ephemeral-thread" }),
    })

    expect(getChatExamplesMock).toHaveBeenCalledTimes(1)
    expect(page.props.initialExamples).toBe(examplesPromise)
  })

  it("skips examples when a task is already selected", async () => {
    const page = await ChatPage({
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
      searchParams: Promise.resolve({ task: "public-task" }),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(getChatExampleMock).toHaveBeenCalledWith("public-task")
    expect(page.props.publicExample).toEqual(publicExample)
  })

  it("skips the Supabase example request in the local visual demo", async () => {
    demoState.enabled = true

    const page = await ChatPage({
      searchParams: Promise.resolve({}),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(page.props.initialExamples).toBeNull()
  })
})
