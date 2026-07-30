import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { WelcomeScreen } from '../WelcomeScreen'

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()

const queryBuilder = {
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  limit: mockLimit,
}

mockSelect.mockReturnValue(queryBuilder)
mockEq.mockReturnValue(queryBuilder)
mockOrder.mockReturnValue(queryBuilder)
mockLimit.mockReturnValue(Promise.resolve({ data: [] }))

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
  QuickTemplateCard: ({ task, onSelect, highPriorityThumbnail }: any) => (
    <div
      data-testid="template-card"
      data-high-priority-thumbnail={String(highPriorityThumbnail)}
      onClick={() => onSelect(task.id)}
    >
      {task.video_title}
    </div>
  )
}))

beforeEach(() => {
  vi.clearAllMocks()
  
  mockSelect.mockReturnValue(queryBuilder)
  mockEq.mockReturnValue(queryBuilder)
  mockOrder.mockReturnValue(queryBuilder)
  mockLimit.mockResolvedValue({ data: [] })
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
    
    mockLimit.mockResolvedValue({ data: mockExamples })

    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)

    await waitFor(() => {
        expect(screen.getAllByTestId('template-card')).toHaveLength(2)
        expect(screen.getByText('Video 1')).toBeInTheDocument()
    })
  })

  it('requests one row of examples and prioritizes only the first thumbnail', async () => {
    const mockExamples = Array.from({ length: 4 }, (_, index) => ({
      id: String(index + 1),
      video_title: `Video ${index + 1}`,
      video_url: `https://example.com/${index + 1}`,
      thumbnail_url: `https://example.com/${index + 1}.jpg`,
    }))

    mockLimit.mockResolvedValue({ data: mockExamples })

    render(<WelcomeScreen onSelectExample={vi.fn()} onSubmit={vi.fn()} />)

    const cards = await screen.findAllByTestId('template-card')

    expect(mockLimit).toHaveBeenCalledWith(4)
    expect(cards[0]).toHaveAttribute('data-high-priority-thumbnail', 'true')
    expect(cards.slice(1).every(card => card.dataset.highPriorityThumbnail === 'false')).toBe(true)
  })

  it('handles example selection', async () => {
    mockLimit.mockResolvedValue({
        data: [{ id: '1', video_title: 'Video 1', video_url: 'url1' }],
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
