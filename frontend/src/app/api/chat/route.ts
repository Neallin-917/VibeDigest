import { streamText, convertToModelMessages, UIMessage, createIdGenerator, stepCountIs } from 'ai';
import { createProviderClient } from '@/lib/llm-config';
import { env } from '@/env';
import type { RequestPayload, ChatMessageRow, ModelTier, PreviewCache, ToolContext } from './types';
import { isTextPart, getLegacyContent, getTextFromUIMessage, extractUrl, isUsableTaskId, getErrorMessage, getErrorStack } from './utils';
import { verifyAuth, isAuthError } from './auth';
import { resolveModelName } from './model-resolver';
import { buildRagContext } from './rag';
import { buildTools } from './tools';
import { createOnFinishHandler } from './persistence';

const SHORT_QUERY_CHAR_LIMIT = 200;

// --- Startup Logging ---
console.log('>>> [API/Chat] Route Initialized <<<');
console.log(`    Model:    ${env.OPENAI_MODEL || 'dynamic (from backend)'}`);
console.log(`    Provider: ${env.LLM_PROVIDER || 'dynamic (defaults to backend)'}`);
console.log(`    Base URL: ${env.OPENAI_BASE_URL || 'Default'}`);
console.log(`    Backend:  ${env.BACKEND_API_URL || 'http://127.0.0.1:8000'}`);
console.log('>>> ---------------------------- <<<');

export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        // Parse request body
        const jsonBody = (await req.json()) as RequestPayload;
        console.log('[API/Chat] Request Body:', JSON.stringify(jsonBody, null, 2));

        const { message, threadId, taskId: bodyTaskId } = jsonBody;
        console.log(`[API/Chat] Incoming Request - Thread: ${threadId}, Task: ${bodyTaskId}`);

        // Fallback for taskId if passed via URL (legacy support)
        const url = new URL(req.url);
        const queryTaskId = url.searchParams.get('taskId');
        const taskId = bodyTaskId || queryTaskId;
        const requestTaskId = isUsableTaskId(taskId) ? taskId : null;
        console.log(`[API/Chat] Resolved TaskID: ${taskId}`);

        // 1. Auth
        const authResult = await verifyAuth();
        if (isAuthError(authResult)) return authResult.response;
        const { supabase, user, accessToken } = authResult;

        // 2. Load Conversation History
        let messages: UIMessage[] = [];
        let threadTitle: string | undefined;

        if (threadId) {
            const { data: thread, error: threadError } = await supabase
                .from('chat_threads')
                .select('id, title')
                .eq('id', threadId)
                .single();

            threadTitle = thread?.title;

            if (threadError && threadError.code !== 'PGRST116') {
                console.error('[API/Chat] Thread lookup error:', threadError);
            }

            if (!thread) {
                console.log('[API/Chat] Thread does not exist yet (Lazy Creation pending):', threadId);
            }

            const { data: dbMessages, error: msgError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('thread_id', threadId)
                .order('created_at', { ascending: true });

            if (msgError) console.error('[API/Chat] Message fetch failed:', msgError);

            if (dbMessages && dbMessages.length > 0) {
                messages = (dbMessages as ChatMessageRow[]).map((msg) => {
                    const parts = Array.isArray(msg.content)
                        ? msg.content
                        : [{ type: 'text', text: JSON.stringify(msg.content) }];
                    return {
                        id: msg.id,
                        role: msg.role,
                        parts: parts as UIMessage['parts'],
                        metadata: { createdAt: new Date(msg.created_at) },
                    } as UIMessage;
                });
            }
        }

        // Append the new incoming message
        if (message) {
            if (!message.parts && typeof message.content === 'string') {
                message.parts = [{ type: 'text', text: message.content }];
            }
            messages.push(message);
        } else {
            console.warn('[API/Chat] No new message received in request body');
        }

        console.log(`[API/Chat] Processing ${messages.length} messages for thread ${threadId}`);

        // 3. Build RAG Context
        const context = await buildRagContext(taskId, supabase);

        // 4. Determine model tier
        const messageText = message
            ? getTextFromUIMessage(message) || getLegacyContent(message)
            : '';
        const detectedUrl = extractUrl(messageText || '');
        const allowVideoTools = Boolean(detectedUrl);
        const isShortFollowup = Boolean(
            taskId && !detectedUrl && messageText.trim().length > 0 && messageText.trim().length <= SHORT_QUERY_CHAR_LIMIT
        );
        const modelTier: ModelTier = isShortFollowup ? 'fast' : 'smart';

        // 5. Resolve model and create provider client
        const { model: modelName, provider: providerName } = await resolveModelName(modelTier);
        const openai = createProviderClient(providerName);

        // 6. Build System Prompt
        let systemPrompt = `You are VibeDigest Assistant, an AI helper for video content analysis.

Use tools proactively to provide accurate, up-to-date information. Never make up information about video content.

When a taskId is provided:
- Call get_task_status only if the user asks about status/progress/completion
- Call get_task_outputs if you need transcript/summary content not already in CURRENT VIDEO CONTEXT
- If the user asks for examples/quotes/verbatim wording and the summary is insufficient, call get_task_outputs with kinds: ["script"]
- Answer directly from CURRENT VIDEO CONTEXT when possible

When users provide video URLs:
- Call preview_video, then create_task, then get_task_status — no confirmation needed
- If no valid URL in the latest message, ask the user for it first
`;

        systemPrompt += allowVideoTools
            ? `\n\nYour available tools:\n- get_task_status: Check current processing status and progress\n- get_task_outputs: Retrieve transcripts, summaries, and other processed content\n- create_task: Start processing a new video URL\n- preview_video: Get video metadata (title, thumbnail, duration) without full processing`
            : `\n\nYour available tools:\n- get_task_status: Check current processing status and progress\n- get_task_outputs: Retrieve transcripts, summaries, and other processed content`;

        systemPrompt += `\n\nNever make up information about video content. Always use tools to get real data before answering.`;

        if (context) {
            systemPrompt += `\n\nCURRENT VIDEO CONTEXT:\n${context}\n\nYou can use the above context to answer questions, but also use tools to get the latest status if needed.`;
        } else if (taskId && taskId !== '00000000-0000-0000-0000-000000000000') {
            systemPrompt += `\n\nCURRENT TASK: ${taskId}\nThe user is asking about a specific task. Use get_task_status to check progress, then get_task_outputs if completed.`;
        } else {
            systemPrompt += `\n\nNo specific task context. Use tools when users mention videos or ask about processing status.`;
        }

        // Note: URL submissions are now handled directly by the frontend (bypassing LLM).
        // This LLM path only runs for non-URL messages (Q&A, status checks).
        // Video tools remain available as fallback for edge cases.

        // 7. Build tools with shared context
        let previewCache: PreviewCache = null;
        const toolContext: ToolContext = {
            supabase,
            user,
            accessToken,
            messages,
            previewCache,
            setPreviewCache: (cache: PreviewCache) => {
                previewCache = cache;
                toolContext.previewCache = cache;
            },
            threadId,
        };
        const tools = buildTools(toolContext, allowVideoTools);

        // 8. Prepare model messages
        console.log('[API/Chat] Converting to model messages...');
        const messagesForModel = messages
            .map((msg) => {
                const textParts = (msg.parts || []).filter((part) => isTextPart(part));
                if (!textParts.length) return null;
                return { ...msg, parts: textParts } as UIMessage;
            })
            .filter((msg): msg is UIMessage => Boolean(msg));
        const coreMessages = await convertToModelMessages(messagesForModel);
        console.log('[API/Chat] Core messages count:', coreMessages.length);

        // 9. Stream response
        console.log('[API/Chat] Starting streamText...');
        const result = streamText({
            model: openai.chat(modelName),
            system: systemPrompt,
            messages: coreMessages,
            stopWhen: stepCountIs(5),
            tools: tools as Parameters<typeof streamText>[0]['tools'],
        });

        result.consumeStream();

        // 10. Return response with persistence hook
        return result.toUIMessageStreamResponse({
            originalMessages: messages,
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
            onFinish: createOnFinishHandler({
                threadId,
                threadTitle,
                requestTaskId,
                user,
                supabase,
                messages,
                openai,
                modelName,
            }),
        });
    } catch (error: unknown) {
        console.error('[API/Chat] Fatal Error:', error);

        const errorMessage = getErrorMessage(error);
        const isAuthErr =
            errorMessage.includes('Missing API Key') ||
            errorMessage.includes('401') ||
            errorMessage.includes('invalid_api_key');

        if (isAuthErr) {
            console.error('[API/Chat] Authentication/Configuration Error detected');
            return new Response(
                JSON.stringify({
                    error: 'Service Configuration Error',
                    details: 'AI Service credentials are missing or invalid. Please check server logs.',
                    debug_details: env.NODE_ENV === 'development' ? errorMessage : undefined,
                }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const isConnectionErr =
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('Cannot connect') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('fetch failed');

        if (isConnectionErr) {
            console.error('[API/Chat] LLM Connection Error detected');
            return new Response(
                JSON.stringify({
                    error: 'LLM Service Unavailable',
                    details: 'Cannot connect to the AI model endpoint. Check that your LLM provider is running and OPENAI_BASE_URL is correct.',
                    debug_details: env.NODE_ENV === 'development' ? errorMessage : undefined,
                }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                error: 'Internal Server Error',
                details: getErrorMessage(error),
                stack: env.NODE_ENV === 'development' ? getErrorStack(error) : undefined,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
