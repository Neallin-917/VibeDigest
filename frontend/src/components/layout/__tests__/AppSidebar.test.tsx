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

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
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

  it('groups active and archived threads separately', () => {
    render(
      <AppSidebar
        threads={[
          { id: 'thread-active', title: 'Active chat', updated_at: '2026-04-19T00:00:00Z', status: 'active' },
          { id: 'thread-archived', title: 'Archived chat', updated_at: '2026-04-18T00:00:00Z', status: 'archived' },
        ]}
      />
    )

    expect(screen.getByText('chat.chats')).toBeInTheDocument()
    expect(screen.getByText('Active chat')).toBeInTheDocument()
    expect(screen.queryByText('Archived chat')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle archived chats' }))

    expect(screen.getByText('chat.archived')).toBeInTheDocument()
    expect(screen.getByText('Archived chat')).toBeInTheDocument()
  })

  it('archives an active thread via the overflow menu', () => {
    const onUpdateThreadStatus = vi.fn()

    render(
      <AppSidebar
        threads={[
          { id: 'thread-active', title: 'Active chat', updated_at: '2026-04-19T00:00:00Z', status: 'active' },
        ]}
        onUpdateThreadStatus={onUpdateThreadStatus}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open thread actions for Active chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat.archive' }))

    expect(onUpdateThreadStatus).toHaveBeenCalledWith('thread-active', 'archived')
  })

  it('restores an archived thread via the overflow menu', () => {
    const onUpdateThreadStatus = vi.fn()

    render(
      <AppSidebar
        threads={[
          { id: 'thread-archived', title: 'Archived chat', updated_at: '2026-04-18T00:00:00Z', status: 'archived' },
        ]}
        selectedThreadId="thread-archived"
        onUpdateThreadStatus={onUpdateThreadStatus}
      />
    )

    expect(screen.getByText('Archived chat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open thread actions for Archived chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat.restore' }))

    expect(onUpdateThreadStatus).toHaveBeenCalledWith('thread-archived', 'active')
  })
})
