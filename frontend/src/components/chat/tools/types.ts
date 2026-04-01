/**
 * Shared types, interfaces, and helpers for Tool UI Components
 */

// ============================================================================
// Core Types
// ============================================================================

export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-denied'

export interface BaseToolPartProps<I = unknown, O = unknown> {
  toolCallId: string
  state: ToolState
  input?: I
  output?: O
  errorText?: string
}

// ============================================================================
// Helpers
// ============================================================================

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const TERMINAL_STATUSES = new Set(['completed', 'failed'])

/** Map a DB row (or Realtime payload) to TaskStatusOutput */
export function mapRowToTask(row: Record<string, unknown>, fallbackTaskId: string): TaskStatusOutput {
  return {
    taskId: typeof row.id === 'string' ? row.id : fallbackTaskId,
    status: row.status === 'pending' || row.status === 'processing' || row.status === 'completed' || row.status === 'failed'
      ? row.status
      : 'pending',
    progress: typeof row.progress === 'number' ? row.progress : 0,
    video_title: typeof row.video_title === 'string' ? row.video_title : undefined,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : undefined,
    video_url: typeof row.video_url === 'string' ? row.video_url : undefined,
    error_message: typeof row.error_message === 'string' ? row.error_message : undefined,
  }
}

// ============================================================================
// get_task_status Types
// ============================================================================

export interface TaskStatusInput {
  taskId: string
}

export interface TaskStatusOutput {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  video_title?: string
  thumbnail_url?: string
  video_url?: string
  error_message?: string
  error?: string
}

export interface GetTaskStatusToolProps extends BaseToolPartProps<TaskStatusInput, TaskStatusOutput> {
  onViewClick?: (taskId: string) => void
}

// ============================================================================
// create_task Types
// ============================================================================

export interface CreateTaskInput {
  video_url?: string
  videoUrl?: string
  url?: string
}

export interface CreateTaskOutput {
  taskId?: string
  status?: string
  message?: string
  videoUrl?: string
  error?: string
  details?: string | Record<string, unknown>
}

export interface CreateTaskToolProps extends BaseToolPartProps {
  input?: CreateTaskInput
  output?: CreateTaskOutput
  onViewClick?: (taskId: string) => void
}

// ============================================================================
// preview_video Types
// ============================================================================

export interface PreviewVideoInput {
  video_url?: string
  videoUrl?: string
  url?: string
}

export interface PreviewVideoOutput {
  title?: string
  thumbnail?: string
  duration?: string
  channel?: string
  error?: string
  details?: string | Record<string, unknown>
}

export interface PreviewVideoToolProps extends BaseToolPartProps {
  input?: PreviewVideoInput
  output?: PreviewVideoOutput
}

// ============================================================================
// get_task_outputs Types
// ============================================================================

export interface GetTaskOutputsInput {
  taskId: string
  kinds?: string[]
}

export interface TaskOutput {
  kind: string
  content: string
  status: string
}

export interface GetTaskOutputsOutput {
  taskId: string
  outputs: TaskOutput[]
  count: number
  error?: string
}

export interface GetTaskOutputsToolProps extends BaseToolPartProps {
  input?: GetTaskOutputsInput
  output?: GetTaskOutputsOutput
}

// ============================================================================
// Unknown Tool Types
// ============================================================================

export interface UnknownToolProps extends BaseToolPartProps {
  toolName: string
}
