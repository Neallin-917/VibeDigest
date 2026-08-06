import { beforeEach, describe, expect, it, vi } from "vitest"
import ChatPage from "./page"

const getChatExamplesMock = vi.hoisted(() => vi.fn())
const demoState = vi.hoisted(() => ({ enabled: false }))

vi.mock("@/lib/chat-examples", () => ({
  getChatExamples: getChatExamplesMock,
}))

vi.mock("@/lib/local-ui-demo", () => ({
  isLocalUiDemo: () => demoState.enabled,
}))

describe("ChatPage", () => {
  beforeEach(() => {
    getChatExamplesMock.mockReset()
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

  it("skips the Supabase example request in the local visual demo", async () => {
    demoState.enabled = true

    const page = await ChatPage({
      searchParams: Promise.resolve({}),
    })

    expect(getChatExamplesMock).not.toHaveBeenCalled()
    expect(page.props.initialExamples).toBeNull()
  })
})
