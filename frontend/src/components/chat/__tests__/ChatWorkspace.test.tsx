import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ChatWorkspace } from '../ChatWorkspace'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../TopHeader', () => ({
  TopHeader: ({ onMobileMenuClick }: { onMobileMenuClick: () => void }) => (
    <div data-testid="top-header"><button onClick={onMobileMenuClick}>Menu</button></div>
  ),
}))

vi.mock('../ChatContainer', () => ({
  ChatContainer: ({ isInteractionLocked }: { isInteractionLocked: boolean }) => (
    <div data-testid="chat-container" data-locked={isInteractionLocked ? 'true' : 'false'} />
  ),
}))

vi.mock('../MobileMenuDrawer', () => ({
  MobileMenuDrawer: ({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (value: boolean) => void }) => (
    <div data-testid="mobile-menu" data-open={isOpen}>
      <button onClick={() => onOpenChange(false)}>Close menu</button>
    </div>
  ),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === 'chat.openingThread' ? `Opening ${values?.title}` : 'Opening chat...',
    locale: 'en',
  }),
}))

describe('ChatWorkspace', () => {
  const defaultProps = {
    activeThreadId: null,
    selectedThreadId: null,
    activeTaskId: null,
    initialMessages: [],
    onNewChat: vi.fn(),
    onSelectThread: vi.fn(),
    onSelectTask: vi.fn(),
    onChatStarted: vi.fn(),
  }

  beforeEach(() => vi.clearAllMocks())

  it('keeps the workspace as one chat surface even with an active task', () => {
    render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)

    expect(screen.getByTestId('top-header')).toBeInTheDocument()
    expect(screen.getByTestId('chat-container')).toBeInTheDocument()
    expect(document.querySelector('.cursor-col-resize')).not.toBeInTheDocument()
    expect(screen.queryByTestId('video-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })

  it('shows the minimal switching veil and locks chat interactions', () => {
    render(
      <ChatWorkspace
        {...defaultProps}
        activeThreadId="thread-a"
        selectedThreadId="thread-b"
        isThreadSwitching
        switchingThreadTitle="Thread B"
      />
    )

    expect(screen.getByLabelText('Opening Thread B')).toBeInTheDocument()
    expect(screen.getByTestId('chat-container')).toHaveAttribute('data-locked', 'true')
  })

  it('opens the mobile navigation without introducing a task detail sheet', () => {
    render(<ChatWorkspace {...defaultProps} />)

    fireEvent.click(screen.getByText('Menu'))
    expect(screen.getByTestId('mobile-menu')).toHaveAttribute('data-open', 'true')
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })
})
