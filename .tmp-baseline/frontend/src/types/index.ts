/**
 * Type definitions for VibeDigest frontend.
 *
 * This file re-exports generated types from backend Pydantic models
 * and defines frontend-specific types.
 */

// Re-export all generated types from Pydantic models
export * from './generated';

// Frontend-specific types (not generated from backend)

export interface Task {
    id: string
    video_url: string
    video_title?: string
    thumbnail_url?: string
    status: string
    created_at: string
}

export interface Thread {
    id: string
    title: string
    updated_at: string
    task_id?: string | null
}

// Re-export hook types for convenience
export type {
    TaskStatus,
    OutputKind,
} from './generated';
