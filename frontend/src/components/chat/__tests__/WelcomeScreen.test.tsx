import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeScreen } from '../WelcomeScreen'
import type { ChatExample } from '@/lib/chat-examples'

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

function resolvedExamples(examples: ChatExample[]) {
  return Object.assign(Promise.resolve(examples), {
    status: 'fulfilled' as const,
    value: examples,
  })
}

const noExamples = resolvedExamples([])

describe('WelcomeScreen', () => {
  it('renders title and input', () => {
    render(
      <WelcomeScreen
        onSelectExample={vi.fn()}
        onSubmit={vi.fn()}
        initialExamples={noExamples}
      />
    )
    expect(screen.getByText('chat.welcome.title')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('streams and renders server-started examples', async () => {
    const mockExamples = [
      { id: '1', video_title: 'Video 1', video_url: 'url1' },
      { id: '2', video_title: 'Video 2', video_url: 'url2' }
    ]

    render(
      <WelcomeScreen
        onSelectExample={vi.fn()}
        onSubmit={vi.fn()}
        initialExamples={resolvedExamples(mockExamples)}
      />
    )

    expect(await screen.findAllByTestId('template-card')).toHaveLength(2)
    expect(screen.getByText('Video 1')).toBeInTheDocument()
  })

  it('prioritizes only the leading thumbnail candidate', async () => {
    const mockExamples = Array.from({ length: 4 }, (_, index) => ({
      id: String(index + 1),
      video_title: `Video ${index + 1}`,
      video_url: `https://example.com/${index + 1}`,
      thumbnail_url: `https://example.com/${index + 1}.jpg`,
    }))

    render(
      <WelcomeScreen
        onSelectExample={vi.fn()}
        onSubmit={vi.fn()}
        initialExamples={resolvedExamples(mockExamples)}
      />
    )

    const cards = await screen.findAllByTestId('template-card')

    expect(cards).toHaveLength(4)
    expect(cards[0]).toHaveAttribute('data-high-priority-thumbnail', 'true')
    expect(
      cards.slice(1).every(card => card.dataset.highPriorityThumbnail === 'false')
    ).toBe(true)
  })

  it('handles example selection', async () => {
    const onSelect = vi.fn()

    render(
      <WelcomeScreen
        onSelectExample={onSelect}
        onSubmit={vi.fn()}
        initialExamples={resolvedExamples([
          { id: '1', video_title: 'Video 1', video_url: 'url1' },
        ])}
      />
    )

    fireEvent.click(await screen.findByText('Video 1'))
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('handles input submission', () => {
    const onSubmit = vi.fn()
    render(
      <WelcomeScreen
        onSelectExample={vi.fn()}
        onSubmit={onSubmit}
        initialExamples={noExamples}
      />
    )
    
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('hello')
  })
})
