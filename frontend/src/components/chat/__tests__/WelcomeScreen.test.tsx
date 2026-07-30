import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { WelcomeScreen } from '../WelcomeScreen'

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()

const queryBuilder = {
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  range: mockRange,
}

mockSelect.mockReturnValue(queryBuilder)
mockEq.mockReturnValue(queryBuilder)
mockOrder.mockReturnValue(queryBuilder)
mockRange.mockReturnValue(Promise.resolve({ data: [], count: 0 }))

const mockSupabase = {
  from: vi.fn(() => queryBuilder)
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabase
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../ChatInput', () => ({
  ChatInput: ({ onSubmit }: any) => (
    <input 
      data-testid="chat-input"
      onChange={() => {}}
      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit('hello') }}
    />
  )
}))

vi.mock('../QuickTemplateCard', () => ({
  QuickTemplateCard: ({ task, onSelect, eagerThumbnail, highPriorityThumbnail }: any) => (
    <div
      data-testid="template-card"
      data-eager-thumbnail={String(eagerThumbnail)}
      data-high-priority-thumbnail={String(highPriorityThumbnail)}
      onClick={() => onSelect(task.id)}
    >
      {task.video_title}
    </div>
  )
}))

const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  
  mockSelect.mockReturnValue(queryBuilder)
  mockEq.mockReturnValue(queryBuilder)
  mockOrder.mockReturnValue(queryBuilder)
  mockRange.mockResolvedValue({ data: [], count: 0 })

  window.IntersectionObserver = vi.fn().mockImplementation(function(cb) {
    (window as any).intersectCallback = cb
    return {
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: vi.fn()
    }
  })
})

describe('WelcomeScreen', () => {
  it('renders title and input', () => {
    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByText('chat.welcome.title')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('fetches and renders examples', async () => {
    const mockExamples = [
      { id: '1', video_title: 'Video 1', video_url: 'url1' },
      { id: '2', video_title: 'Video 2', video_url: 'url2' }
    ]
    
    mockRange.mockResolvedValue({ data: mockExamples, count: 2 })

    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)

    await waitFor(() => {
        expect(screen.getAllByTestId('template-card')).toHaveLength(2)
        expect(screen.getByText('Video 1')).toBeInTheDocument()
    })
  })

  it('eagerly discovers the first row and prioritizes only the first thumbnail', async () => {
    const mockExamples = Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      video_title: `Video ${index + 1}`,
      video_url: `https://example.com/${index + 1}`,
      thumbnail_url: `https://example.com/${index + 1}.jpg`,
    }))

    mockRange.mockResolvedValue({ data: mockExamples, count: 8 })

    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)

    const cards = await screen.findAllByTestId('template-card')

    expect(cards.slice(0, 4).every(card => card.dataset.eagerThumbnail === 'true')).toBe(true)
    expect(cards.slice(4).every(card => card.dataset.eagerThumbnail === 'false')).toBe(true)
    expect(cards[0]).toHaveAttribute('data-high-priority-thumbnail', 'true')
    expect(cards.slice(1).every(card => card.dataset.highPriorityThumbnail === 'false')).toBe(true)
  })

  it('loads more examples on scroll', async () => {
    const page1 = [{ id: '1', video_title: 'Video 1', video_url: 'url1' }]
    const page2 = [{ id: '2', video_title: 'Video 2', video_url: 'url2' }]
    
    mockRange
        .mockResolvedValueOnce({ data: page1, count: 10 })
        .mockResolvedValueOnce({ data: page2, count: 10 })

    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)

    await waitFor(() => {
        expect(screen.getByText('Video 1')).toBeInTheDocument()
    })

    act(() => {
        if ((window as any).intersectCallback) {
            (window as any).intersectCallback([{ isIntersecting: true }])
        }
    })

    await waitFor(() => {
        expect(screen.getByText('Video 2')).toBeInTheDocument()
        expect(screen.getAllByTestId('template-card')).toHaveLength(2)
    })
  })

  it('handles example selection', async () => {
    mockRange.mockResolvedValue({ 
        data: [{ id: '1', video_title: 'Video 1', video_url: 'url1' }], 
        count: 1 
    })
    const onSelect = vi.fn()

    render(<WelcomeScreen onSelectExample={onSelect} onSubmit={vi.fn()} />)

    await waitFor(() => {
        expect(screen.getByText('Video 1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Video 1'))
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('handles input submission', () => {
    const onSubmit = vi.fn()
    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={onSubmit} />)
    
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('hello')
  })
})
