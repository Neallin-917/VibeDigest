import { act, render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResultEngagement, EngagementTracker } from './EngagementTracker'
vi.mock('next/navigation', () => ({ usePathname: () => '/en/chat' }))
let intersect: (entries: unknown[]) => void
const fetchMock = vi.fn()
const entry = (visible: boolean) => [{ isIntersecting: visible, intersectionRect: { height: visible ? 100 : 0 }, boundingClientRect: { height: 200 } }]
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('location', new URL('https://www.vibedigest.io/en/chat'))
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue({ ok: true }))
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof intersect) { intersect = cb } observe() {} disconnect() {} })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('counts only viewport and foreground time, accumulating across hidden intervals', async () => {
  render(<ResultEngagement taskId="task" enabled><p>Actual result</p></ResultEngagement>)
  expect(fetchMock).not.toHaveBeenCalled()
  await act(async () => { intersect(entry(true)); await vi.advanceTimersByTimeAsync(10_000) })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(30_000) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10_000) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ event: 'engaged_read', taskId: 'task' })
})
it('does not track demos or local development', () => {
  render(<ResultEngagement taskId="task" enabled={false}>Demo</ResultEngagement>)
  vi.stubGlobal('location', new URL('http://localhost:3000'))
  render(<EngagementTracker />)
  expect(fetchMock).not.toHaveBeenCalled()
})
it('resets read duration when task changes', async () => {
  const { rerender } = render(<ResultEngagement taskId="one" enabled>One</ResultEngagement>)
  await act(async () => { intersect(entry(true)); await vi.advanceTimersByTimeAsync(15_000) })
  rerender(<ResultEngagement taskId="two" enabled>Two</ResultEngagement>)
  await act(async () => { intersect(entry(true)); await vi.advanceTimersByTimeAsync(5_000) })
  expect(fetchMock.mock.calls.every(call => JSON.parse(call[1].body).event === 'result_view')).toBe(true)
})

it('accumulates across summary and key-ideas regions without counting offscreen time', async () => {
  const { container } = render(<ResultEngagement taskId="task" enabled regions><p data-engagement-region>Summary</p><p data-engagement-region>Ideas</p></ResultEngagement>)
  const [summary, ideas] = container.querySelectorAll('[data-engagement-region]')
  const event = (target: Element, visible: boolean) => ({ target, isIntersecting: visible, intersectionRect: { height: visible ? 100 : 0 } })
  await act(async () => { intersect([event(summary, true)]); await vi.advanceTimersByTimeAsync(5_000) })
  await act(async () => { intersect([event(summary, false), event(ideas, true)]); await vi.advanceTimersByTimeAsync(15_000) })
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ event: 'engaged_read', taskId: 'task' })
})
