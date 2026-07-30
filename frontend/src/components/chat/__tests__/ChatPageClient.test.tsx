import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatPageClient } from '../ChatPageClient'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

let currentSearchParams = new URLSearchParams()
const replaceMock = vi.fn()
const pushMock = vi.fn()
const fetchThreadTaskIdMock = vi.fn<(threadId: string) => Promise<string | null>>()
const idleCallbacks: IdleRequestCallback[] = []

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => currentSearchParams.get(key),
    toString: () => currentSearchParams.toString()
  }),
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    prefetch: vi.fn()
  }),
  usePathname: () => '/en/chat'
}))

vi.mock('@/lib/thread-utils', () => ({
  fetchThreadTaskId: (threadId: string) => fetchThreadTaskIdMock(threadId)
}))

vi.mock('@/components/layout/AppSidebarContext', () => ({
  AppSidebarProvider: ({ children }: { children: any }) => <>{children}</>
}))

vi.mock('@/components/layout/AppSidebar', () => ({
  AppSidebar: (props: any) => (
    <div
      data-testid="sidebar"
      data-selected-thread-id={props.selectedThreadId || props.activeThreadId || ''}
    >
      <button onClick={() => props.onPrefetchThread?.('thread-b')}>Prefetch Thread B</button>
    </div>
  )
}))

vi.mock('../ChatWorkspace', () => ({
  ChatWorkspace: (props: any) => (
    <div
      data-testid="workspace"
      data-thread-id={props.activeThreadId || ''}
      data-task-id={props.activeTaskId || ''}
      data-locked={props.isThreadSwitching ? 'true' : 'false'}
    >
      <button onClick={() => props.onSelectTask('task-b')}>Select Task B</button>
      <button onClick={() => props.onSelectThread?.('thread-b')}>Select Thread B</button>
      <button onClick={() => props.onSelectThread?.('thread-c')}>Select Thread C</button>
      <button onClick={() => props.onChatStarted?.(props.activeThreadId || 'thread-a')}>Chat Started</button>
    </div>
  )
}))

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response
}

function runIdleCallbacks() {
  const callbacks = idleCallbacks.splice(0, idleCallbacks.length)
  callbacks.forEach((callback) => {
    callback({
      didTimeout: false,
      timeRemaining: () => 5,
    } as IdleDeadline)
  })
}

describe('ChatPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchThreadTaskIdMock.mockReset()
    fetchThreadTaskIdMock.mockResolvedValue(null)
    idleCallbacks.length = 0
    Object.defineProperty(window, 'requestIdleCallback', {
      writable: true,
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      })
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      writable: true,
      configurable: true,
      value: vi.fn()
    })
    currentSearchParams = new URLSearchParams()
    replaceMock.mockImplementation((url: string) => {
      const [, query = ''] = url.split('?')
      currentSearchParams = new URLSearchParams(query)
    })
  })

  it('reuses the latest thread when entering with task and no threadId', async () => {
    currentSearchParams = new URLSearchParams('task=task-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([])
      if (url === '/api/threads?taskId=task-a') {
        return jsonResponse([{ id: 'thread-a', title: 'A', updated_at: '2026-02-06T00:00:00Z' }])
      }
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', 'task-a')
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/threads?taskId=task-a')
    expect(replaceMock).toHaveBeenCalledWith('/en/chat?task=task-a&threadId=thread-a', { scroll: false })
  })

  it('keeps reusing the same latest thread for repeated same-task entry', async () => {
    currentSearchParams = new URLSearchParams('task=task-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([])
      if (url === '/api/threads?taskId=task-a') {
        return jsonResponse([{ id: 'thread-a', title: 'A', updated_at: '2026-02-06T00:00:00Z' }])
      }
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      if (url === '/api/threads' && init?.method === 'POST') {
        return jsonResponse({ id: 'new-thread', title: 'New Chat', updated_at: '2026-02-06T00:00:00Z' })
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = renderWithQueryClient(<ChatPageClient />)
    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })
    unmount()

    renderWithQueryClient(<ChatPageClient />)
    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })

    const postCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return url === '/api/threads' && (init as RequestInit | undefined)?.method === 'POST'
    })
    expect(postCalls).toHaveLength(0)
  })

  it('switches to the target task latest thread instead of reusing current thread', async () => {
    currentSearchParams = new URLSearchParams('task=task-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([])
      if (url === '/api/threads?taskId=task-a') {
        return jsonResponse([{ id: 'thread-a', title: 'A', updated_at: '2026-02-06T00:00:00Z' }])
      }
      if (url === '/api/threads?taskId=task-b') {
        return jsonResponse([{ id: 'thread-b', title: 'B', updated_at: '2026-02-06T00:00:00Z' }])
      }
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      if (url === '/api/chat/threads/thread-b/messages') return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })

    fireEvent.click(screen.getByText('Select Task B'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-b')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', 'task-b')
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/threads?taskId=task-b')
    expect(replaceMock).toHaveBeenCalledWith('/en/chat?task=task-b&threadId=thread-b', { scroll: false })
  })

  it('does not call replace when URL is already synchronized', async () => {
    currentSearchParams = new URLSearchParams('task=task-a&threadId=thread-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([])
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', 'task-a')
    })

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('does not call replace on chat-start when threadId is unchanged', async () => {
    currentSearchParams = new URLSearchParams('task=task-a&threadId=thread-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([])
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })

    replaceMock.mockClear()
    fireEvent.click(screen.getByText('Chat Started'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/chat/threads')
    })
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('treats an unknown threadId in the URL as a fresh thread without reloading history', async () => {
    currentSearchParams = new URLSearchParams('threadId=fresh-thread')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
      ])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'fresh-thread')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', '')
    })

    expect(fetchMock).not.toHaveBeenCalledWith('/api/chat/threads/fresh-thread/messages')
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('makes a fresh chat usable before remote history finishes loading', async () => {
    currentSearchParams = new URLSearchParams()
    let resolveThreads!: (response: Response) => void
    const threadResponse = new Promise<Response>((resolve) => {
      resolveThreads = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return threadResponse
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toBeInTheDocument()
      expect(screen.getByTestId('workspace')).not.toHaveAttribute('data-thread-id', '')
    })

    resolveThreads(jsonResponse([]))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/chat/threads')
    })
  })

  it('loads messages only once when selecting a thread from sidebar', async () => {
    // Start with no task/threadId — generates ephemeral thread
    currentSearchParams = new URLSearchParams()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url.startsWith('/api/chat/threads/') && url.endsWith('/messages')) return jsonResponse([])
      // Note: fetchThreadTaskId is module-mocked (see top of file), so /api/threads/<id> won't reach here
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)
    await waitFor(() => expect(screen.getByTestId('workspace')).toBeInTheDocument())

    // Clear all calls from initial bootstrap
    fetchMock.mockClear()

    // Simulate user clicking thread-b via workspace mock
    fireEvent.click(screen.getByText('Select Thread B'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-b')
    })

    // Key assertion: messages API for thread-b should be called only ONCE (not twice)
    const messageFetches = fetchMock.mock.calls.filter(
      ([url]) => url.toString() === '/api/chat/threads/thread-b/messages'
    )
    expect(messageFetches).toHaveLength(1)
  })

  it('keeps the previous thread visible while an uncached thread is loading', async () => {
    currentSearchParams = new URLSearchParams('threadId=thread-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Thread A' }], metadata: { createdAt: '2026-02-06T00:00:00Z' } },
      ])
      if (url === '/api/chat/threads/thread-b/messages') {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return jsonResponse([
          { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'Thread B' }], metadata: { createdAt: '2026-02-06T00:00:00Z' } },
        ])
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-locked', 'false')
    })

    fireEvent.click(screen.getByText('Select Thread B'))

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-locked', 'true')
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-selected-thread-id', 'thread-b')

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-b')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-locked', 'false')
    })
  })

  it('reuses prefetched thread payload on click without refetching messages', async () => {
    currentSearchParams = new URLSearchParams('threadId=thread-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      if (url === '/api/chat/threads/thread-b/messages') return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })

    fetchMock.mockClear()
    fireEvent.click(screen.getByText('Prefetch Thread B'))

    await waitFor(() => {
      const prefetchedCalls = fetchMock.mock.calls.filter(
        ([url]) => url.toString() === '/api/chat/threads/thread-b/messages'
      )
      expect(prefetchedCalls).toHaveLength(1)
    })

    fireEvent.click(screen.getByText('Select Thread B'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-b')
    })

    const threadBMessageFetches = fetchMock.mock.calls.filter(
      ([url]) => url.toString() === '/api/chat/threads/thread-b/messages'
    )
    expect(threadBMessageFetches).toHaveLength(1)
  })

  it('prefetches the top recent threads during idle time', async () => {
    currentSearchParams = new URLSearchParams('threadId=thread-a')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-c', title: 'Thread C', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-d', title: 'Thread D', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-e', title: 'Thread E', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url.startsWith('/api/chat/threads/') && url.endsWith('/messages')) return jsonResponse([])
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
    })

    fetchMock.mockClear()
    runIdleCallbacks()

    await waitFor(() => {
      const prefetchedThreadIds = fetchMock.mock.calls
        .map(([url]) => url.toString())
        .filter((url) => url.endsWith('/messages'))
        .map((url) => url.match(/\/api\/chat\/threads\/(.+)\/messages$/)?.[1])
        .filter(Boolean)

      expect(prefetchedThreadIds).toEqual(['thread-b', 'thread-c', 'thread-d'])
    })
  })

  it('lands on last selected thread when rapidly switching', async () => {
    currentSearchParams = new URLSearchParams()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-c', title: 'Thread C', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url.startsWith('/api/chat/threads/') && url.endsWith('/messages')) return jsonResponse([])
      // Note: fetchThreadTaskId is module-mocked (see top of file), so /api/threads/<id> won't reach here
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)
    await waitFor(() => expect(screen.getByTestId('workspace')).toBeInTheDocument())

    // Rapidly switch: thread-b then thread-c
    fireEvent.click(screen.getByText('Select Thread B'))
    fireEvent.click(screen.getByText('Select Thread C'))

    // Should end up on thread-c (the last one selected)
    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-c')
    })
  })

  it('ignores stale thread selection responses when switching rapidly', async () => {
    currentSearchParams = new URLSearchParams('task=task-a&threadId=thread-a')

    fetchThreadTaskIdMock.mockImplementation(async (threadId: string) => {
      if (threadId === 'thread-b') {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return 'task-b'
      }
      return null
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === '/api/chat/threads') return jsonResponse([
        { id: 'thread-a', title: 'Thread A', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-b', title: 'Thread B', updated_at: '2026-02-06T00:00:00Z' },
        { id: 'thread-c', title: 'Thread C', updated_at: '2026-02-06T00:00:00Z' },
      ])
      if (url === '/api/chat/threads/thread-a/messages') return jsonResponse([])
      if (url === '/api/chat/threads/thread-c/messages') return jsonResponse([])
      if (url === '/api/chat/threads/thread-b/messages') {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return jsonResponse([])
      }
      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<ChatPageClient />)

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-a')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', 'task-a')
    })

    fireEvent.click(screen.getByText('Select Thread B'))
    fireEvent.click(screen.getByText('Select Thread C'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-thread-id', 'thread-c')
      expect(screen.getByTestId('workspace')).toHaveAttribute('data-task-id', '')
    })
  })
})
