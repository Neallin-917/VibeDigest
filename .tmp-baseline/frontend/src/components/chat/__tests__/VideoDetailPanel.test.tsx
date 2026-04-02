import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
        "tasks.summaryStructured.overviewTitle": "Overview"
      }
      return translations[key] || key
    },
    locale: 'en'
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/tasks/shared/VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player">Video Player Stub</div>
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

  it('renders loading state initially', () => {
    mockSingle.mockResolvedValue({ data: null })
    render(<VideoDetailPanel taskId="task-123" />)
    expect(screen.queryByText('chat.contextPanel.title')).not.toBeInTheDocument()
  })

  it('renders task info and video player', async () => {
    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('chat.contextPanel.title')).toBeInTheDocument()
      expect(screen.getByTestId('video-player')).toBeInTheDocument()
    })
  })

  it('renders structured summary content (Insights)', async () => {
    const summaryContent = {
      overview: "An overview of the test video.",
      keypoints: [
        { title: "Key Insight 1", detail: "Detail 1", startSeconds: 10 }
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

  it('renders V4 summary fields and dynamic sections', async () => {
    const summaryContent = {
      version: 4,
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
      expect(screen.getByText('Evidence quote.', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('Insights')).toBeInTheDocument()
      expect(screen.getByText('Item A')).toBeInTheDocument()
    })
  })

  it('handles non-JSON text summary (Markdown fallback)', async () => {
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
      expect(screen.getByText(/This is a markdown summary/)).toBeInTheDocument()
      expect(screen.queryByText('Insight 1')).not.toBeInTheDocument()
    })
  })

  it('handles malformed JSON by treating as text', async () => {
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
      expect(screen.getByText(/{ keypoints:/)).toBeInTheDocument()
      expect(screen.getByText(/incomplete/)).toBeInTheDocument()
    })
  })

  it('handles empty summary gracefully', async () => {
    mockOrder.mockResolvedValue({ data: [] })

    render(<VideoDetailPanel taskId="task-123" />)

    await waitFor(() => {
      expect(screen.getByText('chat.contextPanel.noSummary')).toBeInTheDocument()
    })
  })
})
