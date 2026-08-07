import {
    createIdGenerator,
    createUIMessageStream,
    createUIMessageStreamResponse,
    convertToModelMessages,
    isStepCount,
    pruneMessages,
    toUIMessageStream,
    ToolLoopAgent,
    validateUIMessages,
} from 'ai';
import { createProviderClient } from '@/lib/llm-config';
import { getProviderModelDefaults, resolveProvider, resolveProviderModel } from '@/lib/llm-model-registry';
import { env } from '@/env';
import type { RequestPayload, ChatMessageRow, ModelTier, ResolvedModel } from './types';
import { getTextFromUIMessage, isUsableTaskId, getErrorMessage, getErrorStack } from './utils';
import { verifyAuth, isAuthError } from './auth';
import { buildRagContext } from './rag';
import { ACTIVE_CHAT_TOOLS, chatTools, createChatToolsContext } from './tools';
import { createOnFinishHandler, restoreArchivedThreadIfNeeded } from './persistence';
import {
    chatDataSchemas,
    messageMetadataSchema,
    type ChatUIMessage,
} from '@/lib/chat-ui';
import { isLocalCodexRuntime, runLocalCodex } from '@/lib/local-codex';
import {
    logInvalidChatMessages,
    sanitizeIncomingMessages,
    sanitizeStoredMessages,
} from '@/lib/chat-message-boundary';
import { writeTaskDataParts } from './task-data-parts';

const SHORT_QUERY_CHAR_LIMIT = 200;
const CHAT_TIMEOUT = {
    totalMs: 25_000,
    stepMs: 10_000,
    firstChunkMs: 8_000,
    chunkMs: 8_000,
} as const;
const LOCAL_CODEX_HISTORY_LIMIT = 8;

function resolveModel(tier: ModelTier): ResolvedModel {
    const provider = resolveProvider(env.OPENAI_BASE_URL, env.LLM_PROVIDER);
    getProviderModelDefaults(provider);
    const model = resolveProviderModel(provider, tier, {
        smart: env.MODEL_ALIAS_SMART,
        fast: env.MODEL_ALIAS_FAST,
    });
    return { model, provider };
}

export const maxDuration = 30;

function getSafeStreamingError(error: unknown): string {
    console.error('[API/Chat] Stream error:', error);
    return 'The AI service is temporarily unavailable. Please try again.';
}

function buildLocalCodexPrompt(
    messages: ChatUIMessage[],
    context: string,
): string {
    const conversation = messages
        .map((chatMessage) => {
            const text = getTextFromUIMessage(chatMessage).trim();
            return text ? `${chatMessage.role.toUpperCase()}:\n${text}` : null;
        })
        .filter((entry): entry is string => Boolean(entry))
        .slice(-LOCAL_CODEX_HISTORY_LIMIT)
        .join('\n\n');

    return [
        'SOURCE CONTEXT:',
        context || 'No source context is available for this request.',
        '',
        'CONVERSATION:',
        conversation,
        '',
        'Answer the latest user question concisely. Do not make up facts beyond SOURCE CONTEXT.',
    ].join('\n');
}

export async function POST(req: Request) {
    try {
        // Parse request body
        const jsonBody = (await req.json()) as RequestPayload;

        const { threadId, taskId: bodyTaskId } = jsonBody;

        if (jsonBody.message) {
            const { validMessages, invalidMessages } = sanitizeIncomingMessages([jsonBody.message]);
            if (invalidMessages.length > 0) {
                logInvalidChatMessages({
                    source: 'request',
                    threadId,
                    invalidMessages,
                });
                return Response.json(
                    {
                        error: 'Invalid chat message',
                        details: invalidMessages
                            .map((item) => `${item.id ?? 'unknown'}:${item.failureReason}`)
                            .join(', '),
                    },
                    { status: 400 }
                );
            }
            jsonBody.message = validMessages[0];
        }

        const message = jsonBody.message;

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
            const thread = await restoreArchivedThreadIfNeeded({
                threadId,
                userId: user.id,
                supabase,
            });

            threadTitle = thread?.title;

            const { data: dbMessages, error: msgError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('thread_id', threadId)
                .order('created_at', { ascending: true });

            if (msgError) console.error('[API/Chat] Message fetch failed:', msgError);

            if (dbMessages && dbMessages.length > 0) {
                const persistedMessages = dbMessages as ChatMessageRow[];
                const { validMessages, invalidMessages } = sanitizeStoredMessages(persistedMessages);
                logInvalidChatMessages({
                    source: 'history',
                    threadId,
                    invalidMessages,
                });
                messages = validMessages;
            }
        }

        // Append the new incoming message
        if (message) {
            messages.push(message);
        } else {
            console.warn('[API/Chat] No new message received in request body');
        }

        // Normalize: ensure every message has metadata (AI SDK validates it as object, not undefined)
        messages = messages.map(m => ({ ...m, metadata: m.metadata ?? {} }));

        // 3. Build RAG Context
        const context = await buildRagContext(taskId, supabase);

        // 4. Determine model tier
        const messageText = message ? getTextFromUIMessage(message) : '';
        const isShortFollowup = Boolean(
            taskId && messageText.trim().length > 0 && messageText.trim().length <= SHORT_QUERY_CHAR_LIMIT
        );
        const modelTier: ModelTier = isShortFollowup ? 'fast' : 'smart';

        // 5. Build System Prompt
        let systemPrompt = `You are VibeDigest Assistant, an AI helper for video content analysis.

Use tools proactively to provide accurate, up-to-date information. Never make up information about video content.

When a taskId is provided:
- Call get_task_status only if the user asks about status/progress/completion
- Call get_task_outputs if you need transcript/summary content not already in CURRENT VIDEO CONTEXT
- If the user asks for examples/quotes/verbatim wording and the summary is insufficient, call get_task_outputs with kinds: ["script"]
- Answer directly from CURRENT VIDEO CONTEXT when possible
`;

        systemPrompt += `\n\nYour available tools:\n- get_task_status: Check current processing status and progress\n- get_task_outputs: Retrieve transcripts, summaries, and other processed content`;

        systemPrompt += `\n\nNever make up information about video content. Always use tools to get real data before answering.`;

        if (context) {
            systemPrompt += `\n\nCURRENT VIDEO CONTEXT:\n${context}\n\nYou can use the above context to answer questions, but also use tools to get the latest status if needed.`;
        } else if (taskId && taskId !== '00000000-0000-0000-0000-000000000000') {
            systemPrompt += `\n\nCURRENT TASK: ${taskId}\nThe user is asking about a specific task. Use get_task_status to check progress, then get_task_outputs if completed.`;
        } else {
            systemPrompt += `\n\nNo specific task context. Use tools when users mention videos or ask about processing status.`;
        }

        // URL submission has its own command route. This LLM path handles only
        // Q&A over existing tasks, so it has no task-creation side effects.

        // 6. Build tools with shared context
        const toolsContext = createChatToolsContext({
            supabase,
            user,
            accessToken,
        });

        // 7. Validate UI messages and prepare persistence
        const validatedMessages = await validateUIMessages<ChatUIMessage>({
            messages,
            metadataSchema: messageMetadataSchema,
            dataSchemas: chatDataSchemas,
            tools: chatTools,
        });
        const onFinish = createOnFinishHandler({
            threadId,
            threadTitle,
            requestTaskId,
            user,
            supabase,
            messages: validatedMessages,
        });

        if (isLocalCodexRuntime()) {
            const stream = createUIMessageStream<ChatUIMessage>({
                originalMessages: validatedMessages,
                onFinish,
                execute: async ({ writer }) => {
                    const textId = createIdGenerator({ prefix: 'local-codex', size: 16 })();
                    const response = await runLocalCodex(
                        buildLocalCodexPrompt(validatedMessages, context),
                        req.signal,
                    );

                    writer.write({ type: 'text-start', id: textId });
                    writer.write({ type: 'text-delta', id: textId, delta: response });
                    writer.write({ type: 'text-end', id: textId });
                },
                onError: getSafeStreamingError,
            });

            return createUIMessageStreamResponse({ stream });
        }

        const modelMessages = pruneMessages({
            messages: await convertToModelMessages(validatedMessages),
            reasoning: 'all',
            toolCalls: 'before-last-2-messages',
            emptyMessages: 'remove',
        });

        // 8. Resolve the cloud-provider model only for the hosted-compatible path.
        const { model: modelName, provider: providerName } = resolveModel(modelTier);
        const openai = createProviderClient(providerName);

        // 9. Stream response and emit task data parts for UI cards
        const stream = createUIMessageStream<ChatUIMessage>({
            originalMessages: validatedMessages,
            generateId: createIdGenerator({ prefix: 'msg', size: 16 }),
            onFinish,
            onError: getSafeStreamingError,
            execute: async ({ writer }) => {
                const agent = new ToolLoopAgent({
                    model: openai.chat(modelName),
                    instructions: systemPrompt,
                    // GPT-5.6 tool calls through Chat Completions require an
                    // explicit no-reasoning baseline. The API transport keeps
                    // the existing app-owned tool loop intact.
                    providerOptions: providerName === 'openai'
                        ? { openai: { reasoningEffort: 'none' } }
                        : undefined,
                    stopWhen: isStepCount(5),
                    tools: chatTools,
                    activeTools: ACTIVE_CHAT_TOOLS,
                    toolsContext,
                    timeout: CHAT_TIMEOUT,
                    onStepEnd: ({ finishReason, performance, stepNumber, toolResults, usage }) => {
                        console.info('[API/Chat] AI step completed', {
                            finishReason,
                            inputTokens: usage.inputTokens,
                            outputTokens: usage.outputTokens,
                            responseTimeMs: performance.responseTimeMs,
                            stepNumber,
                            timeToFirstOutputMs: performance.timeToFirstOutputMs,
                            tools: toolResults.map((toolResult) => toolResult.toolName),
                        });

                        toolResults.forEach((toolResult) => {
                            if (!('toolName' in toolResult) || !('output' in toolResult)) return;

                            if (toolResult.toolName === 'get_task_status') {
                                const output = toolResult.output as {
                                    taskId?: string;
                                    status?: 'pending' | 'processing' | 'completed' | 'failed';
                                    progress?: number;
                                    video_title?: string;
                                    thumbnail_url?: string;
                                    video_url?: string;
                                    error_message?: string;
                                };

                                if (
                                    typeof output.taskId === 'string' &&
                                    (output.status === 'pending' ||
                                        output.status === 'processing' ||
                                        output.status === 'completed' ||
                                        output.status === 'failed')
                                ) {
                                    writeTaskDataParts(writer, {
                                        taskId: output.taskId,
                                        status: output.status,
                                        progress: output.progress,
                                        video_title: output.video_title,
                                        thumbnail_url: output.thumbnail_url,
                                        video_url: output.video_url,
                                        error_message: output.error_message,
                                    });
                                }
                            }
                        });
                    },
                });

                const result = await agent.stream({
                    messages: modelMessages,
                    abortSignal: req.signal,
                });

                writer.merge(
                    toUIMessageStream({
                        stream: result.stream,
                        tools: chatTools,
                        onError: getSafeStreamingError,
                    })
                );
            },
        });

        // 10. Return response with persistence hook
        return createUIMessageStreamResponse({ stream });
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
