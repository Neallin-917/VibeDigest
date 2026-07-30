import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { ChatWorkspace } from '../ChatWorkspace'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  })
}))

vi.mock('../TopHeader', () => ({
  TopHeader: ({ onMobileMenuClick }: any) => (
    <div data-testid="top-header">
      <button onClick={onMobileMenuClick}>Menu</button>
    </div>
  )
}))

vi.mock('../ChatContainer', () => ({
  ChatContainer: ({ isInteractionLocked }: any) => (
    <div data-testid="chat-container" data-locked={isInteractionLocked ? 'true' : 'false'}>
      ChatContainer
    </div>
  )
}))

vi.mock('../VideoDetailPanel', () => ({
  VideoDetailPanel: ({ onClose }: any) => (
    <div data-testid="video-panel">
      VideoDetailPanel
      <button onClick={onClose}>Close</button>
    </div>
  )
}))

vi.mock('../MobileMenuDrawer', () => ({
  MobileMenuDrawer: ({ isOpen, onOpenChange }: any) => (
    <div data-testid="mobile-menu" data-open={isOpen}>
      <button onClick={() => onOpenChange(false)}>Close Menu</button>
    </div>
  )
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: any) => open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetTitle: () => <div>Title</div>
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'chat.openingChat') return 'Opening chat...'
      if (key === 'chat.openingThread') return `Opening ${values?.title}`
      return key
    },
    locale: 'en'
  })
}))

const localStorageMock = (function() {
  let store: any = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value.toString() }),
    clear: vi.fn(() => { store = {} })
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('ChatWorkspace', () => {
  const defaultProps = {
    activeThreadId: null,
    selectedThreadId: null,
    activeTaskId: null,
    isThreadSwitching: false,
    initialMessages: [],
    onNewChat: vi.fn(),
    onSelectThread: vi.fn(),
    onSelectTask: vi.fn(),
    onChatStarted: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 1023px)' ? window.innerWidth < 1024 : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    window.dispatchEvent(new Event('resize'))
  })

  it('renders desktop layout correctly', () => {
    render(<ChatWorkspace {...defaultProps} />)
    expect(screen.getByTestId('top-header')).toBeInTheDocument()
    expect(screen.getByTestId('chat-container')).toBeInTheDocument()
    expect(screen.queryByTestId('video-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Opening chat...')).not.toBeInTheDocument()
  })

  it('shows minimal switching veil and locks chat interactions', () => {
    render(
      <ChatWorkspace
        {...defaultProps}
        activeThreadId="thread-a"
        selectedThreadId="thread-b"
        isThreadSwitching={true}
        switchingThreadTitle="Thread B"
      />
    )

    expect(screen.getByText('Opening chat...')).toBeInTheDocument()
    expect(screen.getByTestId('chat-container')).toHaveAttribute('data-locked', 'true')
  })

  it('renders video panel when task is selected (desktop)', async () => {
    render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)
    expect(await screen.findByTestId('video-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
  })

  it('renders sheet on mobile when task is selected', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    window.dispatchEvent(new Event('resize'))

    render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)
    expect(await screen.findByTestId('sheet')).toBeInTheDocument()
    expect(screen.getAllByTestId('video-panel')).toHaveLength(1)
  })

  it('handles panel closing', async () => {
    render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)

    // There might be multiple Close buttons (desktop + mobile)
    const closeBtns = await screen.findAllByText('Close')
    fireEvent.click(closeBtns[0])

    expect(defaultProps.onSelectTask).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByTestId('video-panel')).not.toBeInTheDocument()
    })
  })

  it('opens mobile menu', () => {
    render(<ChatWorkspace {...defaultProps} />)
    
    const menuBtn = screen.getByText('Menu')
    fireEvent.click(menuBtn)
    
    const menu = screen.getByTestId('mobile-menu')
    expect(menu).toHaveAttribute('data-open', 'true')
  })

  it('handles resizing', () => {
    render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)

    const resizer = document.querySelector('.cursor-col-resize') as Element
    expect(resizer).toBeInTheDocument()

    fireEvent.mouseDown(resizer)

    act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 600 })
        window.dispatchEvent(moveEvent)
    })

    act(() => {
        window.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('vibe_panel_width', expect.any(String))
  })

  // -----------------------------------------------------------------------
  // Cycle 4: Resize throttling with requestAnimationFrame
  // -----------------------------------------------------------------------
  describe('resize throttling', () => {
    it('batches rapid mousemove events via rAF and persists final width', () => {
      // Mock rAF to capture callbacks without auto-executing
      const rafCallbacks: FrameRequestCallback[] = []
      const originalRaf = window.requestAnimationFrame
      const originalCaf = window.cancelAnimationFrame
      let rafId = 0
      window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return ++rafId
      })
      window.cancelAnimationFrame = vi.fn()

      // Set document.body.clientWidth for resize calculation
      Object.defineProperty(document.body, 'clientWidth', { value: 1200, configurable: true })

      render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)

      const resizer = document.querySelector('.cursor-col-resize') as Element
      expect(resizer).toBeInTheDocument()

      // Start resizing
      fireEvent.mouseDown(resizer)

      // Fire 10 rapid mousemove events
      for (let i = 0; i < 10; i++) {
        act(() => {
          window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 + i * 10 }))
        })
      }

      // rAF coalescing: since mock rAF never auto-fires, rafIdRef stays non-null
      // after the first schedule, so only 1 rAF should be scheduled for 10 moves
      const rafCallCount = (window.requestAnimationFrame as any).mock.calls.length
      expect(rafCallCount).toBe(1)

      // Flush the rAF callback(s)
      act(() => {
        for (const cb of rafCallbacks) {
          cb(performance.now())
        }
        rafCallbacks.length = 0
      })

      // Stop resizing
      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup'))
      })

      // Final width should be persisted
      expect(localStorageMock.setItem).toHaveBeenCalledWith('vibe_panel_width', expect.any(String))

      // Restore
      window.requestAnimationFrame = originalRaf
      window.cancelAnimationFrame = originalCaf
    })

    it('persists final width from rAF on mouseup', () => {
      render(<ChatWorkspace {...defaultProps} activeTaskId="task-1" />)

      const resizer = document.querySelector('.cursor-col-resize') as Element
      fireEvent.mouseDown(resizer)

      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }))
      })

      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup'))
      })

      expect(localStorageMock.setItem).toHaveBeenCalledWith('vibe_panel_width', expect.any(String))
    })
  })
})
