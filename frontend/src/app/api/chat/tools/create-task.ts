import { z } from 'zod';
import { tool } from 'ai';
import { SERVER_BACKEND_URL } from '@/lib/backend-url';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { extractUrl, findLastUrlInMessages } from '../utils';
import { createTaskToolContextSchema } from './context';

export const createTaskSchema = z.object({
    video_url: z
        .string()
        .describe(
            'REQUIRED: Complete Video URL (YouTube, Bilibili, Apple Podcasts, etc). Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        ),
});

async function readBackendErrorDetails(response: Response) {
    const responseReaders = response as Response & {
        text?: () => Promise<string>;
        json?: () => Promise<unknown>;
    };

    if (typeof responseReaders.text === 'function') {
        const text = await responseReaders.text().catch(() => '');
        return sanitizeErrorMessage(text || `Backend returned status ${response.status}`);
    }

    if (typeof responseReaders.json === 'function') {
        const payload = await responseReaders.json().catch(() => null);
        return sanitizeErrorMessage(payload || `Backend returned status ${response.status}`);
    }

    return sanitizeErrorMessage(`Backend returned status ${response.status}`);
}

export const createTaskTool = tool({
    description:
        "Start video processing (transcribe+summarize). IMPORTANT: Pass URL in 'video_url' parameter ONLY.",
    inputSchema: createTaskSchema,
    contextSchema: createTaskToolContextSchema,
    execute: async (args: z.infer<typeof createTaskSchema>, { context, abortSignal }) => {
            const { supabase, user, accessToken, messages, threadId } = context;
            console.log('[API/Chat] create_task invoked');

            // Enforce 1:1 Thread-Task relationship
            if (threadId) {
                const { data: thread } = await supabase
                    .from('chat_threads')
                    .select('task_id')
                    .eq('id', threadId)
                    .single();

                if (thread?.task_id) {
                    console.log(
                        `[API/Chat] Thread ${threadId} already has task ${thread.task_id}, blocking new task creation`
                    );
                    return {
                        error: 'This conversation is already discussing a video. Please click "New Chat" to discuss a different video.',
                        suggest_new_chat: true,
                        existing_task_id: thread.task_id,
                    };
                }
            }

            let fallbackSource: string | null = null;
            let cleanUrl = extractUrl(args.video_url);

            if (!cleanUrl) {
                console.log('[API/Chat] No valid URL in args, checking history...');
                cleanUrl = findLastUrlInMessages(messages);
                if (cleanUrl) fallbackSource = 'message_history';
            }

            if (fallbackSource) {
                console.warn('[API/Chat] URL fallback used', { source: fallbackSource, tool: 'create_task' });
            }

            if (!cleanUrl) {
                console.error('[API/Chat] Invalid URL in create_task');
                return {
                    error: 'No valid URL found in input or history. Please provide a valid YouTube URL.',
                };
            }

            if (!user?.id) {
                return { error: 'Authentication required' };
            }

            if (!accessToken) {
                return {
                    error: 'SESSION_EXPIRED',
                    user_action: 'sign_in_required',
                    message: 'Your session has expired. Please sign in again.',
                };
            }

            try {
                const response = await fetch(`${SERVER_BACKEND_URL}/api/process-video`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: new URLSearchParams({ video_url: cleanUrl }),
                    signal: abortSignal,
                });
                if (!response.ok) {
                    const details = await readBackendErrorDetails(response);
                    if (response.status === 401) {
                        return {
                            error: 'Authentication failed',
                            user_action: 'sign_in_required',
                            status: response.status,
                        };
                    }
                    if (response.status === 503) {
                        return {
                            error: 'Service configuration error',
                            details,
                            status: response.status,
                        };
                    }
                    return {
                        error: 'Failed to create task',
                        details,
                        status: response.status,
                    };
                }
                const data = await response.json();
                return {
                    taskId: data.task_id,
                    status: 'started',
                    message: data.message || 'Task created successfully',
                    videoUrl: cleanUrl,
                };
            } catch (error) {
                return {
                    error: 'Failed to create task',
                    details: error instanceof Error ? error.message : 'Unknown error',
                };
            }
    },
});
