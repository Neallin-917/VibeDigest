import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import {
  GetTaskStatusTool,
  CreateTaskTool,
  PreviewVideoTool,
  GetTaskOutputsTool,
  UnknownTool
} from './index'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}))

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockChannel = vi.fn()
const mockOn = vi.fn()
const mockSubscribe = vi.fn()
const mockRemoveChannel = vi.fn()

const queryBuilder = {
  select: mockSelect,
  eq: mockEq,
  single: mockSingle,
}

mockSelect.mockReturnValue(queryBuilder)
mockEq.mockReturnValue(queryBuilder)

const mockSupabase = {
  from: vi.fn(() => queryBuilder),
  channel: mockChannel,
  removeChannel: mockRemoveChannel
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabase
}))

describe('Chat Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockChannel.mockReturnValue({
      on: mockOn,
      subscribe: mockSubscribe
    })
    mockOn.mockReturnThis()
    mockSubscribe.mockReturnThis()
  })

  describe('GetTaskStatusTool', () => {
    it('renders loading state', () => {
      render(
        <GetTaskStatusTool
          toolCallId="1"
          state="input-available"
          input={{ taskId: '123' }}
        />
      )
      expect(screen.getByText('chat.tools.status.checkingFor')).toBeInTheDocument()
    })

    it('renders error state', () => {
      render(
        <GetTaskStatusTool
          toolCallId="1"
          state="output-available"
          output={{ 
              taskId: '123', 
              status: 'failed', 
              error: 'Something went wrong' 
          }}
        />
      )
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('renders output-error state', () => {
        render(
          <GetTaskStatusTool
            toolCallId="1"
            state="output-error"
            errorText="Network error"
          />
        )
        expect(screen.getByText(/chat\.tools\.status\.errorGetStatus/)).toBeInTheDocument()
    })

    it('fetches task and subscribes to updates', async () => {
      mockSingle.mockResolvedValue({
        data: {
          id: '123',
          status: 'processing',
          progress: 50,
          video_title: 'Test Video',
          thumbnail_url: 'thumb.jpg'
        }
      })

      render(
        <GetTaskStatusTool
          toolCallId="1"
          state="output-available"
          input={{ taskId: '123' }}
          output={{ taskId: '123', status: 'pending' }}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Test Video')).toBeInTheDocument()
      })

      expect(mockSupabase.from).toHaveBeenCalledWith('tasks')
      expect(mockEq).toHaveBeenCalledWith('id', '123')
      expect(mockChannel).toHaveBeenCalledWith('task_status_123')
      expect(mockOn).toHaveBeenCalled()
    })

    it('updates when realtime event occurs', async () => {
      mockSingle.mockResolvedValue({
        data: { id: '123', status: 'pending', progress: 0 }
      })

      let onChangeCallback: any
      mockOn.mockImplementation((event, filter, cb) => {
        onChangeCallback = cb
        return { subscribe: mockSubscribe, on: mockOn }
      })

      render(
        <GetTaskStatusTool
          toolCallId="1"
          state="output-available"
          input={{ taskId: '123' }}
          output={{ taskId: '123', status: 'pending' }}
        />
      )

      await waitFor(() => {
        const queuedElements = screen.getAllByText('chat.tools.status.statusQueued')
        expect(queuedElements.length).toBeGreaterThan(0)
      })

      act(() => {
        if (onChangeCallback) {
          onChangeCallback({
            new: {
              id: '123',
              status: 'processing',
              progress: 45,
              video_title: 'Processing Video'
            }
          })
        }
      })

      await waitFor(() => {
        expect(screen.getByText('chat.tools.status.statusProcessing')).toBeInTheDocument()
        expect(screen.getByText('Processing Video')).toBeInTheDocument()
      })
    })

    it('shows View Summary button when completed', async () => {
        mockSingle.mockResolvedValue({
            data: { id: '123', status: 'completed', progress: 100, video_title: 'Done' }
        })
        const onViewClick = vi.fn()

        render(
            <GetTaskStatusTool
              toolCallId="1"
              state="output-available"
              output={{ taskId: '123', status: 'completed' }}
              onViewClick={onViewClick}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('chat.tools.status.viewSummary')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('chat.tools.status.viewSummary'))
        expect(onViewClick).toHaveBeenCalledWith('123')
    })
  })

  describe('CreateTaskTool', () => {
    it('renders input state', () => {
      render(
        <CreateTaskTool
          toolCallId="1"
          state="input-available"
          input={{ video_url: 'https://youtube.com/v/123' }}
        />
      )
      expect(screen.getByText(/chat\.tools\.create\.starting/)).toBeInTheDocument()
    })

    it('renders success state', () => {
      const onViewClick = vi.fn()
      render(
        <CreateTaskTool
          toolCallId="1"
          state="output-available"
          output={{ taskId: '123', message: 'Created', videoUrl: 'http://video' }}
          onViewClick={onViewClick}
        />
      )
      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText('http://video')).toBeInTheDocument()
      
      fireEvent.click(screen.getByText('chat.tools.create.viewProgress'))
      expect(onViewClick).toHaveBeenCalledWith('123')
    })

    it('renders error state', () => {
        render(
          <CreateTaskTool
            toolCallId="1"
            state="output-available"
            output={{ error: 'Creation failed', details: 'Invalid URL' }}
          />
        )
        expect(screen.getByText('chat.tools.create.failed')).toBeInTheDocument()
        expect(screen.getByText('Invalid URL')).toBeInTheDocument()
    })
  })

  describe('PreviewVideoTool', () => {
    it('renders loading state', () => {
      render(
        <PreviewVideoTool
          toolCallId="1"
          state="input-available"
          input={{ video_url: 'http://test' }}
        />
      )
      expect(screen.getByText(/chat\.tools\.preview\.fetching/)).toBeInTheDocument()
    })

    it('renders video info', () => {
      render(
        <PreviewVideoTool
          toolCallId="1"
          state="output-available"
          output={{ title: 'Cool Video', duration: '10:00', channel: 'Test Channel' }}
        />
      )
      expect(screen.getByText('Cool Video')).toBeInTheDocument()
      expect(screen.getByText('10:00')).toBeInTheDocument()
      expect(screen.getByText('Test Channel')).toBeInTheDocument()
    })

    it('renders error', () => {
        render(
            <PreviewVideoTool
              toolCallId="1"
              state="output-available"
              output={{ error: 'Not found' }}
            />
        )
        expect(screen.getByText('Not found')).toBeInTheDocument()
    })
  })

  describe('GetTaskOutputsTool', () => {
    it('renders loading', () => {
        render(
            <GetTaskOutputsTool
              toolCallId="1"
              state="input-available"
              input={{ taskId: '1', kinds: ['summary'] }}
            />
        )
        expect(screen.getByText(/chat\.tools\.outputs\.retrieving/)).toBeInTheDocument()
    })

    it('renders output count', () => {
        render(
            <GetTaskOutputsTool
              toolCallId="1"
              state="output-available"
              output={{ taskId: '1', outputs: [], count: 3 }}
            />
        )
        expect(screen.getByText('chat.tools.outputs.retrieved')).toBeInTheDocument()
    })
  })

  describe('GetTaskStatusTool – error recovery (Bug 1)', () => {
    it('should recover from "Task not found" error when task appears in DB later', async () => {
      // First call (recovery attempt) returns the task
      mockSingle.mockResolvedValue({
        data: {
          id: 'task-recover',
          status: 'processing',
          progress: 20,
          video_title: 'Recovered Video',
          thumbnail_url: null,
          video_url: null,
          error_message: null,
        }
      })

      render(
        <GetTaskStatusTool
          toolCallId="recover-1"
          state="output-available"
          output={{
            taskId: 'task-recover',
            status: 'failed',
            error: 'Task not found',
          }}
        />
      )

      // Should eventually recover and show the task card instead of the error
      await waitFor(() => {
        expect(screen.getByText('Recovered Video')).toBeInTheDocument()
      }, { timeout: 3000 })

      // Error text should no longer be visible
      expect(screen.queryByText('Task not found')).not.toBeInTheDocument()
    })

    it('should show error for genuinely missing task (no taskId)', () => {
      render(
        <GetTaskStatusTool
          toolCallId="no-id"
          state="output-available"
          output={{
            taskId: '',
            status: 'failed',
            error: 'Task not found',
          }}
        />
      )
      // With no valid taskId, recovery should not be attempted
      expect(screen.getByText('Task not found')).toBeInTheDocument()
    })
  })

  describe('UnknownTool', () => {
    it('renders running state', () => {
        render(
            <UnknownTool
              toolCallId="1"
              toolName="mystery_tool"
              state="input-available"
            />
        )
        expect(screen.getByText('chat.tools.unknown.running')).toBeInTheDocument()
    })

    it('renders completed state', () => {
        render(
            <UnknownTool
              toolCallId="1"
              toolName="mystery_tool"
              state="output-available"
            />
        )
        expect(screen.getByText('chat.tools.unknown.completed')).toBeInTheDocument()
    })
  })
})
