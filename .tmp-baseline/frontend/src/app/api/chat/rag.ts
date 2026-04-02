import type { ToolContext } from './types';

/**
 * Build RAG context from task data and outputs in Supabase.
 * Returns a context string for the system prompt, or empty string if no task.
 */
export async function buildRagContext(
    taskId: string | null | undefined,
    supabase: ToolContext['supabase']
): Promise<string> {
    if (!taskId || taskId === '00000000-0000-0000-0000-000000000000') {
        return '';
    }

    const { data: task } = await supabase
        .from('tasks')
        .select('video_title, video_url, status, progress')
        .eq('id', taskId)
        .single();

    const { data: outputs } = await supabase
        .from('task_outputs')
        .select('kind, content, status')
        .eq('task_id', taskId)
        .in('kind', ['summary']);

    const completedOutputs = outputs?.filter((o) => o.status === 'completed') || [];

    if (!task) {
        console.warn(`[API/Chat] Task ${taskId} not found in DB`);
        return '';
    }

    console.log(`[API/Chat] Task Found: ${task.video_title} (${task.status})`);
    const contextParts: string[] = [];
    if (task.video_title) contextParts.push(`Video Title: ${task.video_title}`);
    if (task.video_url) contextParts.push(`Video URL: ${task.video_url}`);
    if (task.status) contextParts.push(`Task Status: ${task.status} (${task.progress || 0}%)`);

    if (completedOutputs.length > 0) {
        console.log(`[API/Chat] Found ${completedOutputs.length} completed outputs`);
        const summary = completedOutputs.find((o) => o.kind === 'summary');
        const summaryContent = summary?.content || '';
        if (summaryContent) {
            contextParts.push(`## Summary\n${summaryContent}`);
        }
    } else {
        console.log('[API/Chat] No completed outputs found for this task');
    }

    return contextParts.join('\n\n');
}
