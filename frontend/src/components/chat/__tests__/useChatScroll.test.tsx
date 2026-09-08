import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTaskDataParts, createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui'
import { useChatScroll } from '../useChatScroll'

const digest = createTaskDataParts({ messageId: 'digest', taskId: 'task-1', status: 'completed' })
const question = createUserTextMessage('question', 'Why does this matter?')

function mountScroll() {
  const hook = renderHook(({ messages }: { messages: ChatUIMessage[] }) => useChatScroll({
    messages, status: 'ready', activeTaskId: 'task-1',
  }), { initialProps: { messages: [] as ChatUIMessage[] } })
  const element = document.createElement('div')
  Object.defineProperties(element, {
    scrollHeight: { value: 4000 },
    clientHeight: { value: 800 },
  })
  hook.result.current.scrollRef.current = element
  return { ...hook, element }
}

describe('useChatScroll', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => vi.unstubAllGlobals())

  it('opens a completed standalone digest at the beginning and preserves reading position', () => {
    const { rerender, element, result } = mountScroll()
    element.scrollTop = 2000
    rerender({ messages: [digest] })
    expect(element.scrollTop).toBe(0)

    element.scrollTop = 600
    act(() => result.current.handleScroll())
    rerender({ messages: [{ ...digest }] })
    expect(element.scrollTop).toBe(600)
  })

  it('scrolls to the first follow-up even when the reader was near the digest beginning', () => {
    const { rerender, element, result } = mountScroll()
    rerender({ messages: [digest] })
    act(() => result.current.handleScroll())
    rerender({ messages: [digest, question] })
    expect(element.scrollTop).toBe(4000)
  })

  it('keeps historical conversations at the latest message and respects scrolling up', () => {
    const { rerender, element, result } = mountScroll()
    rerender({ messages: [digest, question] })
    expect(element.scrollTop).toBe(4000)
    element.scrollTop = 300
    act(() => result.current.handleScroll())
    rerender({ messages: [digest, question, { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Answer' }] }] })
    expect(element.scrollTop).toBe(300)
  })
})
