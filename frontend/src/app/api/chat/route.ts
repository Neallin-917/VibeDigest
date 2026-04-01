import { streamText, convertToModelMessages, createIdGenerator, stepCountIs, validateUIMessages } from 'ai';
import { createProviderClient } from '@/lib/llm-config';
import { getProviderModelDefaults, resolveProvider, resolveProviderModel } from '@/lib/llm-model-registry';
import { env } from '@/env';
import type { RequestPayload, ChatMessageRow, ModelTier, ResolvedModel, PreviewCache, ToolContext } from './types';
import { getTextFromUIMessage, extractUrl, isUsableTaskId, getErrorMessage, getErrorStack } from './utils';
import { verifyAuth, isAuthError } from './auth';
import { buildRagContext } from './rag';
import { buildAllTools, buildTools } from './tools';
import { createOnFinishHandler } from './persistence';
import { type ChatUIMessage, isStrictStoredMessageRow, toStoredChatUIMessage } from '@/lib/chat-ui';

const SHORT_QUERY_CHAR_LIMIT = 200;

function resolveModel(tier: ModelTier): ResolvedModel {
    const provider = resolveProvider(env.OPENAI_BASE_URL);
    getProviderModelDefaults(provider);
    const model = resolveProviderModel(provider, tier, {
        smart: env.MODEL_ALIAS_SMART,
        fast: env.MODEL_ALIAS_FAST,
    });
    return { model, provider };
}

export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        // Parse request body
        const jsonBody = (await req.json()) as RequestPayload;

        const { message, threadId, taskId: bodyTaskId } = jsonBody;

        // Fallback for taskId if passed via URL (legacy support)
        const url = new URL(req.url);
        const queryTaskId = url.searchParams.get('taskId');
        const taskId = bodyTaskId || queryTaskId;
        const requestTaskId = isUsableTaskId(taskId) ? taskId : null;

        // 1. Auth
        const authResult = await verifyAuth();
        if (isAuthError(authResult)) return authResult.response;
        const { supabase, user, accessToken } = authResult;

        // 2. Load Conversation History
        let messages: ChatUIMessage[] = [];
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

            const { data: dbMessages, error: msgError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('thread_id', threadId)
                .order('created_at', { ascending: true });

            if (msgError) console.error('[API/Chat] Message fetch failed:', msgError);

            if (dbMessages && dbMessages.length > 0) {
                const persistedMessages = dbMessages as ChatMessageRow[];
                const invalidMessageIds = persistedMessages
                    .filter((msg) => !isStrictStoredMessageRow(msg))
                    .map((msg) => msg.id);

                if (invalidMessageIds.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('chat_messages')
                        .delete()
                        .in('id', invalidMessageIds);

                    if (deleteError) {
                        console.error('[API/Chat] Failed to delete invalid historical messages:', deleteError);
                    } else {
                        console.warn(
                            `[API/Chat] Deleted ${invalidMessageIds.length} invalid historical messages from ${threadId}`
                        );
                    }
                }

                messages = persistedMessages
                    .filter(isStrictStoredMessageRow)
                    .map((msg) => toStoredChatUIMessage(msg));
            }
        }

        // Append the new incoming message
        if (message) {
            messages.push(message);
        } else {
            console.warn('[API/Chat] No new message received in request body');
        }

        // 3. Build RAG Context
        const context = await buildRagContext(taskId, supabase);

        // 4. Determine model tier
        const messageText = message ? getTextFromUIMessage(message) : '';
        const detectedUrl = extractUrl(messageText || '');
        const allowVideoTools = Boolean(detectedUrl);
        const isShortFollowup = Boolean(
            taskId && !detectedUrl && messageText.trim().length > 0 && messageText.trim().length <= SHORT_QUERY_CHAR_LIMIT
        );
        const modelTier: ModelTier = isShortFollowup ? 'fast' : 'smart';

        // 5. Resolve model and create provider client
        const { model: modelName, provider: providerName } = resolveModel(modelTier);
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
        const allTools = buildAllTools(toolContext);
        const tools = buildTools(allTools, allowVideoTools);

        // 8. Validate UI messages and convert to model messages
        const validatedMessages = await validateUIMessages<ChatUIMessage>({
            messages,
            tools: allTools,
        });
        const coreMessages = await convertToModelMessages(validatedMessages);

        // 9. Stream response
        const result = streamText({
            model: openai.chat(modelName),
            system: systemPrompt,
            messages: coreMessages,
            stopWhen: stepCountIs(5),
            tools,
        });

        result.consumeStream();

        // 10. Return response with persistence hook
        return result.toUIMessageStreamResponse({
            originalMessages: validatedMessages,
            generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
            onFinish: createOnFinishHandler({
                threadId,
                threadTitle,
                requestTaskId,
                user,
                supabase,
                messages: validatedMessages,
                openai,
                modelName,
            }),
        });
    } catch (error: unknown) {
        console.error('[API/Chat] Fatal Error:', error);

        const errorMessage = getErrorMessage(error);
        const isAuthErr =
            errorMessage.includes('Missing API Key') ||
            errorMessage.includes('Unsupported provider') ||
            errorMessage.includes('Invalid base URL') ||
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
