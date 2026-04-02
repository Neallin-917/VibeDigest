/**
 * SSE Event types - Auto-generated from backend/schemas/events.py
 * DO NOT EDIT MANUALLY - Run `npm run generate-types` to regenerate
 */

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'error';

export type OutputKind =
  | 'script'
  | 'script_raw'
  | 'audio'
  | 'classification'
  | 'summary'
  | 'comprehension_brief';

export interface TaskProgressEvent {
  event_type: 'progress';
  task_id: string;
  status: TaskStatus;
  progress: number;
  stage: string;
  message?: string;
  timestamp: string;
}

export interface TaskOutputEvent {
  event_type: 'output';
  task_id: string;
  output_id: string;
  output_kind: OutputKind;
  status: TaskStatus;
  content?: string;
  locale?: string;
  timestamp: string;
}

export interface TaskCompleteEvent {
  event_type: 'complete';
  task_id: string;
  status: 'completed';
  video_title?: string;
  thumbnail_url?: string;
  duration?: number;
  timestamp: string;
}

export interface TaskErrorEvent {
  event_type: 'error';
  task_id: string;
  status: 'error';
  error: string;
  error_code?: string;
  recoverable: boolean;
  timestamp: string;
}

export interface HeartbeatEvent {
  event_type: 'heartbeat';
  timestamp: string;
}

export type SSEEvent =
  | TaskProgressEvent
  | TaskOutputEvent
  | TaskCompleteEvent
  | TaskErrorEvent
  | HeartbeatEvent;
