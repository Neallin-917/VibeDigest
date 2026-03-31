import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppSidebar } from '../AppSidebar'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => '/en/tasks/task-123',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('../AppSidebarContext', () => ({
  useAppSidebar: () => ({
    isCollapsed: false,
    toggleSidebar: vi.fn(),
  }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}))

vi.mock('uuid', () => ({
  v4: () => 'new-thread-id',
}))

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates directly to a fresh chat thread when no onNewChat handler is provided', () => {
    render(<AppSidebar />)

    fireEvent.click(screen.getByRole('button', { name: /chat\.newChat/i }))

    expect(pushMock).toHaveBeenCalledWith('/en/chat?threadId=new-thread-id')
  })
})
