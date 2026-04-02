import { z } from 'zod';
import { tool } from 'ai';
import { BACKEND_API_URL } from '@/lib/backend-url';
import { extractUrl } from '../utils';
import type { ToolContext } from '../types';

export const taskStatusSchema = z.object({
    taskId: z.string().describe('The ID of the task to check'),
});

export function createGetTaskStatusTool(ctx: ToolContext) {
    return tool({
        description: 'Get the current processing status and progress of a video task',
        inputSchema: taskStatusSchema,
        execute: async ({ taskId }: z.infer<typeof taskStatusSchema>) => {
            // 1. Try Direct Database Access (Fastest)
            const { data } = await ctx.supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            // Helper: build response from a DB row
            const buildResponse = (row: typeof data) => {
                if (!row) return null;
                if (row.user_id !== ctx.user?.id && !row.is_demo) {
                    return { error: 'Access denied', taskId };
                }
                const normalizedTaskUrl = extractUrl(row.video_url || '');
                const canUsePreview = Boolean(
                    ctx.previewCache && normalizedTaskUrl && ctx.previewCache.url === normalizedTaskUrl
                );
                const previewTitle = canUsePreview ? ctx.previewCache?.title : undefined;
                const previewThumbnail = canUsePreview ? ctx.previewCache?.thumbnail : undefined;
                const normalizedTitle =
                    row.video_title && row.video_title !== 'Unknown'
                        ? row.video_title
                        : previewTitle;

                return {
                    taskId: row.id,
                    status: row.status,
                    progress: row.progress,
                    video_title: normalizedTitle,
                    thumbnail_url: row.thumbnail_url || previewThumbnail,
                    video_url: row.video_url,
                    error_message: row.error_message,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                };
            };

            if (data) {
                const response = buildResponse(data);
                if (response) return response;
            }

            // 1b. Retry after 500ms (handles race with create_task write propagation)
            if (!data) {
                await new Promise(r => setTimeout(r, 500));
                const { data: retryData } = await ctx.supabase
                    .from('tasks')
                    .select('*')
                    .eq('id', taskId)
                    .single();

                if (retryData) {
                    const response = buildResponse(retryData);
                    if (response) return response;
                }
            }

            // 2. Fallback: Try Backend API
            if (ctx.user?.id && ctx.accessToken) {
                try {
                    console.warn(`[API/Chat] Task ${taskId} not found in DB, trying Backend API fallback...`);
                    const response = await fetch(`${BACKEND_API_URL}/api/tasks/${taskId}/status`, {
                        headers: {
                            Authorization: `Bearer ${ctx.accessToken}`,
                        },
                    });

                    if (response.ok) {
                        const apiData = await response.json();
                        console.log(`[API/Chat] Task ${taskId} recovered via Backend API`);
                        return {
                            taskId: apiData.id,
                            status: apiData.status,
                            progress: apiData.progress,
                            video_title: apiData.video_title,
                            thumbnail_url: apiData.thumbnail_url,
                            video_url: apiData.video_url,
                            error_message: apiData.error,
                            created_at: apiData.created_at,
                            updated_at: apiData.updated_at,
                            source: 'backend_api_fallback',
                        };
                    }
                } catch (apiError) {
                    console.error(`[API/Chat] Backend API fallback failed for ${taskId}:`, apiError);
                }
            }

            return { error: 'Task not found', taskId };
        },
    });
}
