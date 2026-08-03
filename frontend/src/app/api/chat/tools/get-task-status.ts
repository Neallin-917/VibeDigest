import { z } from 'zod';
import { tool } from 'ai';
import { SERVER_BACKEND_URL } from '@/lib/backend-url';
import { normalizeTaskStatus, sanitizeErrorMessage } from '@/lib/safe-error';
import { getTaskStatusToolContextSchema } from './context';

export const taskStatusSchema = z.object({
    taskId: z.string().describe('The ID of the task to check'),
});

export const getTaskStatusTool = tool({
    description: 'Get the current processing status and progress of a video task',
    inputSchema: taskStatusSchema,
    contextSchema: getTaskStatusToolContextSchema,
    execute: async ({ taskId }: z.infer<typeof taskStatusSchema>, { context, abortSignal }) => {
            const { supabase, user, accessToken } = context;
            // 1. Try Direct Database Access (Fastest)
            const { data } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            // Helper: build response from a DB row
            const buildResponse = (row: typeof data) => {
                if (!row) return null;
                if (row.user_id !== user?.id && !row.is_demo) {
                    return { error: 'Access denied', taskId };
                }
                return {
                    taskId: row.id,
                    status: normalizeTaskStatus(row.status),
                    progress: row.progress,
                    video_title: row.video_title,
                    thumbnail_url: row.thumbnail_url,
                    video_url: row.video_url,
                    error_message: row.error_message ? sanitizeErrorMessage(row.error_message) : row.error_message,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                };
            };

            if (data) {
                const response = buildResponse(data);
                if (response) return response;
            }

            // 1b. Retry once for a just-committed task write.
            if (!data) {
                await new Promise(r => setTimeout(r, 500));
                const { data: retryData } = await supabase
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
            if (user?.id && accessToken) {
                try {
                    console.warn(`[API/Chat] Task ${taskId} not found in DB, trying Backend API fallback...`);
                    const response = await fetch(`${SERVER_BACKEND_URL}/api/tasks/${taskId}/status`, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                        signal: abortSignal,
                    });

                    if (response.ok) {
                        const apiData = await response.json();
                        console.log(`[API/Chat] Task ${taskId} recovered via Backend API`);
                        return {
                            taskId: apiData.id,
                            status: normalizeTaskStatus(apiData.status),
                            progress: apiData.progress,
                            video_title: apiData.video_title,
                            thumbnail_url: apiData.thumbnail_url,
                            video_url: apiData.video_url,
                            error_message: apiData.error_message || apiData.error
                                ? sanitizeErrorMessage(apiData.error_message || apiData.error)
                                : apiData.error_message || apiData.error,
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
