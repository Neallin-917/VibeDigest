/**
 * Fetch the task_id associated with a given thread.
 *
 * Returns the task_id string if the thread has one, or null if:
 * - The thread has no associated task
 * - The thread does not exist
 * - The user is not authenticated
 * - A network error occurs
 */
export async function fetchThreadTaskId(threadId: string): Promise<string | null> {
    if (!threadId) return null

    try {
        const res = await fetch(`/api/threads/${threadId}`)
        if (!res.ok) return null

        const thread = await res.json()
        return thread.task_id ?? null
    } catch {
        return null
    }
}
