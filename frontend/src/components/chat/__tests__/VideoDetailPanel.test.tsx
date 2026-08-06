import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VideoDetailPanel } from '../VideoDetailPanel'

// Define mocks
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockSingle = vi.fn()
const mockLimit = vi.fn()
const mockOrder = vi.fn()

// Chainable query builder
const queryBuilder = {
  select: mockSelect,
  eq: mockEq,
  in: mockIn,
  single: mockSingle,
  limit: mockLimit,
  order: mockOrder,
}

// Setup chain return values
mockSelect.mockReturnValue(queryBuilder)
mockEq.mockReturnValue(queryBuilder)
mockIn.mockReturnValue(queryBuilder)
mockLimit.mockReturnValue(queryBuilder)
// mockSingle is terminal, returns Promise

mockOrder.mockImplementation(() => Promise.resolve({ data: [] }))
mockSingle.mockImplementation(() => Promise.resolve({ data: null }))
mockLimit.mockImplementation(() => Promise.resolve({ data: [] }))

const mockSupabase = {
  from: vi.fn(() => queryBuilder),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "tasks.summaryStructured.keypointsTitle": "Key Insights",
        "tasks.summaryStructured.tldrTitle": "TL;DR",
        "tasks.summaryStructured.sectionsTitle": "Sections",
        "tasks.summaryStructured.overviewTitle": "Overview",
        "tasks.summaryStructured.evidenceLabel": "Evidence",
        "chat.contextPanel.noSummary": "No summary available",
        "chat.contextPanel.analyzingVideo": "Analyzing video...",
        "chat.closeVideoDetails": "Close video details",
        "chat.tools.status.videoTask": "Video task",
      }
      return translations[key] || key
    },
    locale: 'en'
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/tasks/shared/VideoPlayer', () => ({
  VideoPlayer: ({ title }: { title?: string }) => (
    <div data-testid="video-player">{title ?? 'Video Player Stub'}</div>
  )
}))

vi.mock('../ProcessingIndicator', () => ({
  ProcessingIndicator: ({ label }: { label: string }) => (
    <div data-testid="processing-indicator" role="status" aria-live="polite">{label}</div>
  ),
}))

describe('VideoDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset default behaviors
    mockSelect.mockReturnValue(queryBuilder)
    mockEq.mockReturnValue(queryBuilder)
    // mockIn is the terminal call in fetching outputs
    mockIn.mockReturnValue(queryBuilder)
    // mockOrder is the terminal call
    mockOrder.mockResolvedValue({ data: [] })

    // mockSingle is the terminal call in fetching task
    mockSingle.mockResolvedValue({
      data: {
        id: 'task-123',
        video_title: 'Test Video',
        video_url: 'https://youtu.be/test',
        status: 'completed'
      }
    })
  })

  it('renders a calm loading state while task data is unavailable', () => {
    mockSingle.mockResolvedValue({ data: null })
    render(<VideoDetailPanel taskId="task-123" />)
    expect(screen.getByText('chat.contextPanel.title')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('tasks.loadingTask')
  })

  it('provides a full-size, named close target', () => {
    const onClose = vi.fn()

    render(<VideoDetailPanel taskId="task-123" onClose={onClose} />)

    const closeButton = screen.getByRole('button', { name: 'Close video details' })
    expect(closeButton).toHaveClass('h-11', 'w-11')

    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders task info and video player', async () => {
    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('chat.contextPanel.title')).toBeInTheDocument()
      expect(screen.getByTestId('video-player')).toBeInTheDocument()
    })
  })

  it('shows the semantic processing indicator while no summary is available', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'task-123',
        video_title: 'Test Video',
        video_url: 'https://youtu.be/test',
        status: 'processing',
      },
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByTestId('processing-indicator')).toHaveTextContent('Analyzing video...')
    })
    expect(screen.getByTestId('processing-indicator')).toHaveAttribute('aria-live', 'polite')
  })

  it('uses a clear source label when the saved task has no metadata title', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'task-123',
        video_title: null,
        video_url: 'https://www.youtube.com/watch?v=test',
        status: 'completed',
      },
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByTestId('video-player')).toHaveTextContent('YouTube · Video task')
    })
  })

  it('renders structured summary content (Insights)', async () => {
    const summaryContent = {
      version: 4,
      language: 'en',
      overview: "An overview of the test video.",
      keypoints: [
        { title: "Key Insight 1", detail: "Detail 1", evidence: "Evidence 1", startSeconds: 10 }
      ]
    }

    mockOrder.mockResolvedValue({
      data: [{
        kind: 'summary',
        status: 'completed',
        content: JSON.stringify(summaryContent)
      }]
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('Key Insight 1')).toBeInTheDocument()
      expect(screen.getByText('An overview of the test video.')).toBeInTheDocument()
    })
  })

  it('renders V4 summary fields and reveals evidence on demand', async () => {
    const summaryContent = {
      version: 4,
      language: 'en',
      tl_dr: "Short take for V4.",
      overview: "V4 overview text.",
      keypoints: [
        {
          title: "Key Insight 1",
          detail: "Detail 1",
          why_it_matters: "Why this matters.",
          evidence: "Evidence quote."
        }
      ],
      sections: [
        {
          section_type: "insights",
          title: "Insights",
          description: "Section description.",
          items: [
            {
              content: "Item A",
              metadata: { speaker: "Alice", originality: "novel" }
            }
          ]
        }
      ]
    }

    mockOrder.mockResolvedValue({
      data: [{
        kind: 'summary',
        status: 'completed',
        content: JSON.stringify(summaryContent)
      }]
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('TL;DR')).toBeInTheDocument()
      expect(screen.getByText('Short take for V4.')).toBeInTheDocument()
      expect(screen.getByText('Why this matters.')).toBeInTheDocument()
      expect(screen.getByText('Insights')).toBeInTheDocument()
      expect(screen.getByText('Item A')).toBeInTheDocument()
    })

    expect(screen.queryByText('Evidence quote.', { exact: false })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Evidence'))
    await waitFor(() => {
      expect(screen.getByText('Evidence quote.', { exact: false })).toBeInTheDocument()
    })
  })

  it('treats non-JSON legacy text as missing summary', async () => {
    const markdownSummary = "# Video Summary\nThis is a markdown summary."

    mockOrder.mockResolvedValue({
      data: [{
        kind: 'summary',
        status: 'completed',
        content: markdownSummary
      }]
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('No summary available')).toBeInTheDocument()
      expect(screen.queryByText(/This is a markdown summary/)).not.toBeInTheDocument()
    })
  })

  it('treats malformed JSON as missing summary', async () => {
    const malformedJson = "{ keypoints: [ ... incomplete"

    mockOrder.mockResolvedValue({
      data: [{
        kind: 'summary',
        status: 'completed',
        content: malformedJson
      }]
    })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('No summary available')).toBeInTheDocument()
      expect(screen.queryByText(/{ keypoints:/)).not.toBeInTheDocument()
    })
  })

  it('handles empty summary gracefully', async () => {
    mockOrder.mockResolvedValue({ data: [] })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('No summary available')).toBeInTheDocument()
    })
  })
})
