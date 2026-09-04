import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/types'
import type { ChatUIMessage } from '@/lib/chat-ui'
import type { ThreadPayload } from './useThreadPayload'
import { useThreadNavigation } from './useThreadNavigation'

const { navigation, replace, uuid, loadPayload, prefetchPayload, invalidatePayload, preload, toastError, fetchMock } = vi.hoisted(() => ({
  navigation: { search: '', pathname: '/zh/chat' },
  replace: vi.fn(), uuid: vi.fn(), loadPayload: vi.fn(), prefetchPayload: vi.fn(),
  invalidatePayload: vi.fn(), preload: vi.fn(), toastError: vi.fn(), fetchMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace }),
}))
vi.mock('uuid', () => ({ v4: uuid }))
vi.mock('./useThreadPayload', () => ({
  useLoadThreadPayload: () => loadPayload,
  usePrefetchThread: () => prefetchPayload,
  useInvalidateThreadPayload: () => invalidatePayload,
}))
vi.mock('@/components/chat/LazyMessageRow', () => ({ preloadMessageRow: preload }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key === 'chat.errors.historyLoad' ? '无法加载对话记录。' : key,
  }),
}))

const threadA = '11111111-1111-4111-8111-111111111111'
const threadB = '22222222-2222-4222-8222-222222222222'
const taskB = '33333333-3333-4333-8333-333333333333'
const thread = (id: string, taskId: string | null = null): Thread => ({
  id, title: 'Thread ' + id, status: 'active', task_id: taskId, updated_at: '2026-08-28T00:00:00Z',
})
const message = (id: string): ChatUIMessage => ({ id, role: 'assistant', parts: [{ type: 'text', text: 'Message ' + id }] })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function StrictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>
}

function mount(options: { search?: string; strict?: boolean; refetch?: () => Promise<Thread[]>; threads?: Thread[] } = {}) {
  navigation.search = options.search ?? ''
  const refetchThreads = options.refetch ?? vi.fn<() => Promise<Thread[]>>().mockResolvedValue([])
  const renders: { threadId: string | null; bootstrapping: boolean }[] = []
  const hook = renderHook(() => {
    const state = useThreadNavigation({ threads: options.threads ?? [], refetchThreads })
    // Capture render-time state, before initialization effects can change it.
    renders.push({ threadId: state.activeThreadId, bootstrapping: state.isBootstrapping })
    return state
  }, options.strict ? { wrapper: StrictWrapper } : undefined)
  const publishSearch = (search: string) => act(() => {
    navigation.search = search
    hook.rerender()
  })
  return { ...hook, renders, refetchThreads, publishSearch }
}

beforeEach(() => {
  vi.resetAllMocks()
  navigation.search = ''
  navigation.pathname = '/zh/chat'
  let nextId = 0
  uuid.mockImplementation(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++nextId).padStart(12, '0')}`)
  loadPayload.mockResolvedValue({ taskId: null, messages: [] } satisfies ThreadPayload)
  preload.mockResolvedValue(undefined)
  fetchMock.mockRejectedValue(new Error('Unexpected network request in navigation unit test'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('fresh chat identity', () => {
  it('has a usable UUID on the first render and reuses it after initialization', () => {
    const { result, renders } = mount()
    const firstId = renders[0].threadId
    expect(firstId).toMatch(/^aaaaaaaa-aaaa-4aaa-8aaa-/)
    expect(renders[0].bootstrapping).toBe(false)
    expect(result.current.activeThreadId).toBe(firstId)
    expect(result.current.selectedThreadId).toBe(firstId)
    expect(result.current.activeTaskId).toBeNull()
    expect(result.current.isBootstrapping).toBe(false)
    expect(renders.every(render => render.threadId === firstId)).toBe(true)
    expect(uuid).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledExactlyOnceWith('/zh/chat?threadId=' + firstId, { scroll: false })
  })

  it('retains the same identity while the sidebar refresh remains pending or completes', async () => {
    const refresh = deferred<Thread[]>()
    const refetch = vi.fn(() => refresh.promise)
    const { result, renders } = mount({ refetch })
    const firstId = renders[0].threadId
    expect(result.current.isBootstrapping).toBe(false)
    await act(async () => { refresh.resolve([thread(threadA)]) })
    expect(result.current.activeThreadId).toBe(firstId)
    expect(renders.every(render => render.threadId === firstId)).toBe(true)
    expect(loadPayload).not.toHaveBeenCalled()
  })

  it('does not replace the committed identity during StrictMode render and effect replay', async () => {
    const { result, renders } = mount({ strict: true })
    await act(async () => {})
    const firstId = renders[0].threadId
    expect(firstId).not.toBeNull()
    expect(renders.length).toBeGreaterThan(1)
    expect(new Set(renders.map(render => render.threadId))).toEqual(new Set([firstId]))
    expect(result.current.activeThreadId).toBe(firstId)
    expect(replace.mock.calls.every(([url]) => url === '/zh/chat?threadId=' + firstId)).toBe(true)
    // StrictMode may probe a lazy initializer twice. Its effect must not consume
    // another UUID or publish a different composer identity.
    expect(uuid.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('creates a different identity only when New Chat is explicitly selected', () => {
    const { result, publishSearch } = mount()
    const initialId = result.current.activeThreadId
    act(() => result.current.handleNewChat())
    const newId = result.current.activeThreadId
    expect(newId).not.toBe(initialId)
    expect(newId).toMatch(/^aaaaaaaa-aaaa-4aaa-8aaa-/)
    expect(result.current.initialMessages).toEqual([])
    expect(result.current.activeTaskId).toBeNull()
    expect(result.current.selectedThreadId).toBe(newId)
    publishSearch('threadId=' + newId)
    expect(result.current.activeThreadId).toBe(newId)
    expect(uuid).toHaveBeenCalledTimes(2)
  })

  it('creates a new bare-/chat identity after an existing query-backed conversation', async () => {
    const { result, publishSearch } = mount()
    const firstId = result.current.activeThreadId
    publishSearch('threadId=' + firstId)
    await act(async () => {})
    expect(result.current.activeThreadId).toBe(firstId)
    publishSearch('')
    expect(result.current.activeThreadId).not.toBe(firstId)
    expect(result.current.activeThreadId).not.toBeNull()
    expect(uuid).toHaveBeenCalledTimes(2)
  })
})

describe('localized navigation errors', () => {
  it('shows a Chinese error when chat history cannot be loaded', async () => {
    loadPayload.mockRejectedValueOnce(new Error('history unavailable'))
    const { result } = mount({ threads: [thread(threadA)] })

    await act(async () => {
      await result.current.handleSelectThread(threadA)
    })

    expect(toastError).toHaveBeenCalledWith('无法加载对话记录。')
  })
})

describe('stale initialization cannot overwrite newer navigation', () => {
  it('does not let an old thread-list response overwrite New Chat before the URL update commits', async () => {
    const oldRefresh = deferred<Thread[]>()
    const { result } = mount({ search: 'threadId=' + threadA, refetch: () => oldRefresh.promise })
    act(() => result.current.handleNewChat())
    const newId = result.current.activeThreadId
    expect(newId).not.toBe(threadA)
    expect(result.current.isBootstrapping).toBe(false)
    // router.replace does not guarantee that useSearchParams publishes the new
    // URL before this older request completes.
    await act(async () => { oldRefresh.resolve([]) })
    expect(result.current.activeThreadId).toBe(newId)
    expect(result.current.isBootstrapping).toBe(false)
    expect(result.current.initialMessages).toEqual([])
    expect(loadPayload).not.toHaveBeenCalled()
  })

  it('ignores an old thread-list response after New Chat has published its URL', async () => {
    const oldRefresh = deferred<Thread[]>()
    const { result, publishSearch } = mount({ search: 'threadId=' + threadA, refetch: () => oldRefresh.promise })
    act(() => result.current.handleNewChat())
    const newId = result.current.activeThreadId
    publishSearch('threadId=' + newId)
    await act(async () => { oldRefresh.resolve([]) })
    expect(result.current.activeThreadId).toBe(newId)
    expect(result.current.selectedThreadId).toBe(newId)
    expect(loadPayload).not.toHaveBeenCalled()
  })

  it('ignores an older missing-thread result after URL navigation restores another thread', async () => {
    const oldRefresh = deferred<Thread[]>()
    const refetch = vi.fn<() => Promise<Thread[]>>().mockReturnValueOnce(oldRefresh.promise).mockResolvedValue([thread(threadB, taskB)])
    const latestMessages = [message('latest-message')]
    loadPayload.mockResolvedValue({ taskId: taskB, messages: latestMessages })
    const { result, publishSearch } = mount({ search: 'threadId=' + threadA, refetch })
    publishSearch('threadId=' + threadB)
    await waitFor(() => {
      expect(result.current.activeThreadId).toBe(threadB)
      expect(result.current.initialMessages).toEqual(latestMessages)
    })
    await act(async () => { oldRefresh.resolve([]) })
    expect(result.current.activeThreadId).toBe(threadB)
    expect(result.current.activeTaskId).toBe(taskB)
    expect(result.current.initialMessages).toEqual(latestMessages)
    expect(loadPayload).toHaveBeenCalledExactlyOnceWith(threadB, taskB)
  })

  it('does not start the old thread payload load if its thread-list result arrives after navigation', async () => {
    const oldRefresh = deferred<Thread[]>()
    const refetch = vi.fn<() => Promise<Thread[]>>().mockReturnValueOnce(oldRefresh.promise).mockResolvedValue([])
    const { result, publishSearch } = mount({ search: 'threadId=' + threadA, refetch })
    publishSearch('threadId=' + threadB)
    await waitFor(() => expect(result.current.isBootstrapping).toBe(false))
    await act(async () => { oldRefresh.resolve([thread(threadA)]) })
    expect(result.current.activeThreadId).toBe(threadB)
    expect(loadPayload).not.toHaveBeenCalled()
  })

  it('ignores an old payload already in flight when the URL changes', async () => {
    const oldPayload = deferred<ThreadPayload>()
    const refetch = vi.fn<() => Promise<Thread[]>>().mockResolvedValue([thread(threadA), thread(threadB)])
    const latestMessages = [message('new-thread-answer')]
    loadPayload.mockImplementation((id: string) => id === threadA ? oldPayload.promise : Promise.resolve({ taskId: null, messages: latestMessages }))
    const { result, publishSearch } = mount({ search: 'threadId=' + threadA, refetch })
    await waitFor(() => expect(loadPayload).toHaveBeenCalledWith(threadA, null))
    publishSearch('threadId=' + threadB)
    await waitFor(() => expect(result.current.initialMessages).toEqual(latestMessages))
    await act(async () => { oldPayload.resolve({ taskId: 'old-task', messages: [message('old-answer')] }) })
    expect(result.current.activeThreadId).toBe(threadB)
    expect(result.current.activeTaskId).toBeNull()
    expect(result.current.initialMessages).toEqual(latestMessages)
  })
})
