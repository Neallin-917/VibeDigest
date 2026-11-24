import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TaskSummaryVersionStatus } from './TaskSummaryVersionStatus'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
const fetchVersion = vi.fn()
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchVersion) })
afterEach(() => { vi.unstubAllGlobals() })

it('waits for an existing job without creating another', () => {
  render(<TaskSummaryVersionStatus taskId="task" locale="zh" target="en" status="waiting" />)
  expect(screen.getByRole('status').textContent).toBe('正在准备英文版…')
  expect(fetchVersion).not.toHaveBeenCalled()
})

it('refreshes if the version completed before the page requested it', async () => {
  fetchVersion.mockResolvedValue(Response.json({ status: 'completed' }))
  render(<TaskSummaryVersionStatus taskId="task" locale="en" target="zh" status="request" />)
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
  expect(fetchVersion).toHaveBeenCalledWith('/api/tasks/task/summary-version',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ locale: 'zh' }) }))
})

it('stops promising a digest when its source is unavailable', async () => {
  fetchVersion.mockResolvedValue(Response.json({ status: 'unavailable' }))
  render(<TaskSummaryVersionStatus taskId="task" locale="zh" target="zh" status="request" />)
  await screen.findByText('这个语言版本暂时无法提供。')
  expect(fetchVersion).toHaveBeenCalledTimes(1)
})
