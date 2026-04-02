/**
 * API Response types - Auto-generated from backend/schemas/api.py
 * DO NOT EDIT MANUALLY - Run `npm run generate-types` to regenerate
 */

import { TaskStatus, OutputKind } from './events';

export interface TaskCreateResponse {
  task_id: string;
  message: string;
}

export interface TaskStatusResponse {
  id: string;
  video_url: string;
  video_title?: string;
  thumbnail_url?: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  created_at: string;
  updated_at?: string;
  duration?: number;
  author?: string;
}

export interface VideoPreviewResponse {
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  url: string;
  description?: string;
  upload_date?: string;
  view_count?: number;
}

export interface TaskOutputResponse {
  id: string;
  task_id: string;
  kind: OutputKind;
  status: TaskStatus;
  content?: string;
  locale?: string;
  progress: number;
  error?: string;
  created_at: string;
  updated_at?: string;
}

export interface TaskWithOutputsResponse {
  task: TaskStatusResponse;
  outputs: TaskOutputResponse[];
}

export interface RetryOutputResponse {
  message: string;
  output_id?: string;
}

export interface ErrorResponse {
  detail: string;
  error_code?: string;
}

export interface QuotaExceededResponse {
  detail: string;
  error_code: string;
  remaining_credits?: number;
}
