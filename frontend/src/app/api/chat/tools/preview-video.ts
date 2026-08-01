import { z } from 'zod';
import { tool } from 'ai';
import { SERVER_BACKEND_URL } from '@/lib/backend-url';
import { extractUrl, findLastUrlInMessages } from '../utils';
import { previewVideoToolContextSchema } from './context';

export const previewVideoSchema = z.object({
    video_url: z
        .string()
        .describe(
            'REQUIRED: Complete Video URL (YouTube, Bilibili, Apple Podcasts, etc). Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        ),
});

export const previewVideoTool = tool({
    description:
        "Fetch video metadata (title, thumbnail, duration). IMPORTANT: Pass URL in 'video_url' parameter ONLY.",
    inputSchema: previewVideoSchema,
    contextSchema: previewVideoToolContextSchema,
    execute: async (args: z.infer<typeof previewVideoSchema>, { context, abortSignal }) => {
            const { accessToken, messages, setPreviewCache } = context;
            console.log('[API/Chat] preview_video invoked');

            let fallbackSource: string | null = null;
            let cleanUrl = extractUrl(args.video_url);

            if (!cleanUrl) {
                console.log('[API/Chat] No valid URL in args, checking history...');
                cleanUrl = findLastUrlInMessages(messages);
                if (cleanUrl) fallbackSource = 'message_history';
            }

            if (fallbackSource) {
                console.warn('[API/Chat] URL fallback used', { source: fallbackSource, tool: 'preview_video' });
            }

            if (!cleanUrl) {
                console.error('[API/Chat] Invalid URL in preview_video');
                return {
                    error: 'No valid URL found in input or history. Please provide a valid YouTube URL.',
                };
            }

            if (!accessToken) {
                return {
                    error: 'SESSION_EXPIRED',
                    user_action: 'sign_in_required',
                    message: 'Your session has expired. Please sign in again.',
                };
            }

            try {
                const response = await fetch(`${SERVER_BACKEND_URL}/api/preview-video`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: new URLSearchParams({ url: cleanUrl }),
                    signal: abortSignal,
                });
                const data = await response.json();
                if (!response.ok) {
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
                            details: 'The server is temporarily misconfigured. Please try again later.',
                            status: response.status,
                        };
                    }
                    return {
                        error: 'Failed to preview video',
                        details: data.detail || 'Unknown error',
                        status: response.status,
                    };
                }
                if (data?.title || data?.thumbnail) {
                    setPreviewCache({
                        url: cleanUrl,
                        title: data.title,
                        thumbnail: data.thumbnail,
                    });
                }
                return data;
            } catch (error) {
                return {
                    error: 'Failed to preview video',
                    details: error instanceof Error ? error.message : 'Unknown error',
                };
            }
    },
});
