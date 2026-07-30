/**
 * Type definitions for VibeDigest frontend.
 *
 * Keep only frontend-owned view models here. Cloud API contracts are validated
 * at their request boundaries instead of copied from a stale code generator.
 */

export interface Task {
    id: string
    video_url: string
    video_title?: string
    thumbnail_url?: string
    status: string
    created_at: string
}

export type ThreadStatus = 'active' | 'archived' | 'deleted'

export interface Thread {
    id: string
    title: string
    updated_at: string
    status: ThreadStatus
    task_id?: string | null
}
