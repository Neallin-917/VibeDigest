import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThreadsQuery } from './useThreadsQuery'
import { threadKeys } from './queryKeys'
import type { Thread } from '@/types'

vi.mock('@/lib/local-ui-demo', () => ({ isLocalUiDemo: () => false }))

const history: Thread[] = [{
  id: 'thread-1', title: 'Saved conversation', status: 'active', updated_at: '2026-09-07T00:00:00Z',
}]
const fetchMock = vi.fn()

function mount(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useThreadsQuery({ enabled }), { wrapper }) }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('useThreadsQuery', () => {
  it('preserves cached history on a failed refresh and recovers on retry', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => history })
    const { result, client } = mount()
    await waitFor(() => expect(result.current.status).toBe('success'))

    fetchMock.mockRejectedValueOnce(new Error('Network unavailable'))
    await act(async () => {
      await expect(result.current.refetch()).rejects.toThrow('Network unavailable')
    })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.threads).toEqual(history)
    expect(client.getQueryData(threadKeys.all)).toEqual(history)

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.threads).toEqual([])
  })

  it.each([401, 500])('keeps a first HTTP %s failure distinct from an empty history', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status })
    const { result, client } = mount()
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(client.getQueryData(threadKeys.all)).toBeUndefined()
  })

  it('rejects a malformed successful response instead of erasing history', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: 'unavailable' }) })
    const { result, client } = mount()
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(client.getQueryData(threadKeys.all)).toBeUndefined()
  })

  it('treats a successful empty array as an empty history', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
    const { result } = mount()
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.threads).toEqual([])
  })

  it('does not fetch or report an empty success while private history is disabled', async () => {
    const { result } = mount(false)
    await act(async () => { await result.current.refetch() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.status).toBe('pending')
  })
})
