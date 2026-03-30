import type { UIMessage } from 'ai';
import { generateText } from 'ai';
import type { ToolContext } from './types';
import {
    getTextFromUIMessage,
    getMessageCreatedAtIso,
    extractTaskIdFromCreateTaskMessages,
} from './utils';

type PersistenceParams = {
    threadId: string | undefined;
    threadTitle: string | undefined;
    requestTaskId: string | null;
    user: { id: string; email?: string };
    supabase: ToolContext['supabase'];
    messages: UIMessage[];
    openai: ReturnType<typeof import('@/lib/llm-config').createProviderClient>;
    modelName: string;
};

/**
 * Creates the onFinish callback for stream response persistence.
 * Handles thread lazy creation, message upsert, task binding, and title generation.
 */
export function createOnFinishHandler(params: PersistenceParams) {
    const {
        threadId,
        threadTitle,
        requestTaskId,
        user,
        supabase,
        messages,
        openai,
        modelName,
    } = params;

    return async ({ messages: finalMessages }: { messages: UIMessage[] }) => {
        try {
            if (!threadId) {
                console.warn('[API/Chat] No threadId in onFinish, skipping persistence.');
                return;
            }

            // 1. Determine Task ID binding first (from tool outputs or request)
            const createdTaskId = extractTaskIdFromCreateTaskMessages(finalMessages);
            const taskIdToBind = createdTaskId || requestTaskId;

            // 2. Check if thread exists (Lazy Creation check)
            const { data: existingThread } = await supabase
                .from('chat_threads')
                .select('id')
                .eq('id', threadId)
                .single();

            if (!existingThread) {
                const threadInsertPayload: Record<string, unknown> = {
                    id: threadId,
                    user_id: user.id,
                    title: 'New Chat',
                    updated_at: new Date().toISOString(),
                };
                if (taskIdToBind) {
                    threadInsertPayload.task_id = taskIdToBind;
                }

                const { error: createError } = await supabase
                    .from('chat_threads')
                    .insert(threadInsertPayload);
                if (createError) {
                    console.error('[API/Chat] Lazy thread creation failed:', createError);
                    return;
                }
            }

            // Batch upsert: single DB round-trip instead of N+1 SELECT+INSERT
            const messagesToUpsert = finalMessages.map((msg) => ({
                id: msg.id,
                thread_id: threadId,
                role: msg.role,
                content: msg.parts,
                created_at: getMessageCreatedAtIso(msg),
            }));

            const { error: upsertError } = await supabase
                .from('chat_messages')
                .upsert(messagesToUpsert, { onConflict: 'id', ignoreDuplicates: true });

            if (upsertError) {
                console.error('[API/Chat] Batch message upsert failed:', upsertError);
            }

            const threadUpdatePayload: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            };
            if (taskIdToBind) {
                threadUpdatePayload.task_id = taskIdToBind;
            }

            await supabase
                .from('chat_threads')
                .update(threadUpdatePayload)
                .eq('id', threadId);

            // Title Generation
            const isNewChat = !threadTitle || threadTitle === 'New Chat';

            if (isNewChat) {
                const firstUserMsg = [...messages, ...finalMessages].find(
                    (m) => m.role === 'user' && getTextFromUIMessage(m).length > 0
                );

                const firstAssistantTextMsg = finalMessages.find(
                    (m) => m.role === 'assistant' && getTextFromUIMessage(m).length > 0
                );

                if (firstUserMsg && firstAssistantTextMsg) {
                    const userText = getTextFromUIMessage(firstUserMsg);
                    const assistantText = getTextFromUIMessage(firstAssistantTextMsg);

                    try {
                        const { text: title } = await generateText({
                            model: openai.chat(modelName),
                            system: 'Generate a very concise title (3-6 words) for this chat conversation based on the first message. Do not use quotes.',
                            prompt: `User message: ${userText}\nAssistant response: ${assistantText}`,
                        });

                        if (title) {
                            await supabase
                                .from('chat_threads')
                                .update({ title: title.trim() })
                                .eq('id', threadId);
                        }
                    } catch (e) {
                        console.error('[API/Chat] Failed to generate title:', e);
                    }
                }
            }
        } catch (persistError) {
            console.error('[API/Chat] Persistence Error in onFinish:', persistError);
        }
    };
}
