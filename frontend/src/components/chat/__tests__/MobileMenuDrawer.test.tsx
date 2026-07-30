import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileMenuDrawer } from '../MobileMenuDrawer'

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/chat',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/layout/BrandLogo', () => ({
  BrandLogo: () => <div>Brand</div>,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('MobileMenuDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders archived threads in a separate section', () => {
    render(
      <MobileMenuDrawer
        isOpen={true}
        onOpenChange={vi.fn()}
        onNewChat={vi.fn()}
        onOpenLibrary={vi.fn()}
        threads={[
          { id: 'thread-active', title: 'Active chat', updated_at: '2026-04-19T00:00:00Z', status: 'active' },
          { id: 'thread-archived', title: 'Archived chat', updated_at: '2026-04-18T00:00:00Z', status: 'archived' },
        ]}
      />
    )

    expect(screen.getByText('Active chat')).toBeInTheDocument()
    expect(screen.queryByText('Archived chat')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle archived chats' }))

    expect(screen.getByText('chat.archived')).toBeInTheDocument()
    expect(screen.getByText('Archived chat')).toBeInTheDocument()
  })

  it('restores archived threads from the mobile overflow menu', () => {
    const onUpdateThreadStatus = vi.fn()

    render(
      <MobileMenuDrawer
        isOpen={true}
        onOpenChange={vi.fn()}
        onNewChat={vi.fn()}
        onOpenLibrary={vi.fn()}
        threads={[
          { id: 'thread-archived', title: 'Archived chat', updated_at: '2026-04-18T00:00:00Z', status: 'archived' },
        ]}
        selectedThreadId="thread-archived"
        onUpdateThreadStatus={onUpdateThreadStatus}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open thread actions for Archived chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat.restore' }))

    expect(onUpdateThreadStatus).toHaveBeenCalledWith('thread-archived', 'active')
  })

  it('limits the initial thread list and loads older chats on demand', () => {
    const threads = Array.from({ length: 25 }, (_, index) => ({
      id: `thread-${index + 1}`,
      title: `Chat ${index + 1}`,
      updated_at: `2026-04-${String(25 - index).padStart(2, '0')}T00:00:00Z`,
      status: 'active' as const,
    }))

    render(
      <MobileMenuDrawer
        isOpen={true}
        onOpenChange={vi.fn()}
        onNewChat={vi.fn()}
        onOpenLibrary={vi.fn()}
        threads={threads}
      />
    )

    expect(screen.getByText('Chat 20')).toBeInTheDocument()
    expect(screen.queryByText('Chat 21')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'chat.loadMore' }))

    expect(screen.getByText('Chat 25')).toBeInTheDocument()
  })

  it('localizes persisted default titles and the mobile hint', () => {
    render(
      <MobileMenuDrawer
        isOpen={true}
        onOpenChange={vi.fn()}
        onNewChat={vi.fn()}
        onOpenLibrary={vi.fn()}
        threads={[
          { id: 'thread-default', title: 'New Chat', updated_at: '2026-04-19T00:00:00Z', status: 'active' },
        ]}
      />
    )

    expect(screen.getAllByText('chat.newChat')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Open thread actions for chat.newChat' })).toBeInTheDocument()
    expect(screen.queryByText('New Chat')).not.toBeInTheDocument()
    expect(screen.getByText('chat.moreOptionsHint')).toBeInTheDocument()
  })
})
