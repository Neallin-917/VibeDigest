import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useThreadPayload } from './useThreadPayload'
import type { ChatUIMessage } from '@/lib/chat-ui'

const fetchThreadTaskIdMock = vi.fn<(threadId: string) => Promise<string | null>>()

vi.mock('@/lib/thread-utils', () => ({
  fetchThreadTaskId: (threadId: string) => fetchThreadTaskIdMock(threadId),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useThreadPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchThreadTaskIdMock.mockResolvedValue('task-123')
  })

  it('consumes normalized ChatUIMessage responses directly', async () => {
    const apiMessages: ChatUIMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Thread A' }],
        metadata: { createdAt: '2026-02-06T00:00:00Z' },
      },
    ]

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads/thread-a/messages') {
        return {
          ok: true,
          status: 200,
          json: async () => apiMessages,
        } as Response
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    }))

    const { result } = renderHook(() => useThreadPayload('thread-a'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.taskId).toBe('task-123')
    expect(result.current.messages).toEqual(apiMessages)
  })

  it('keeps a real empty thread distinct from a failed message request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }) as Response))

    const { result } = renderHook(() => useThreadPayload('empty-thread'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it.each([401, 500])('surfaces HTTP %i instead of treating the thread as empty', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status,
      json: async () => [],
    }) as Response))

    const { result } = renderHook(() => useThreadPayload('unavailable-thread'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toEqual(
      expect.objectContaining({ message: `Failed to load thread messages (${status})` }),
    )
  })

  it('surfaces a network failure instead of treating the thread as empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network unavailable')
    }))

    const { result } = renderHook(() => useThreadPayload('offline-thread'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toEqual(
      expect.objectContaining({ message: 'Network unavailable' }),
    )
  })
})
