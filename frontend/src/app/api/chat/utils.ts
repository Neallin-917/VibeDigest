import { extractAndNormalizeUrl } from '@/lib/url-utils';
import type { ChatUIMessage, ChatMessageMetadata } from '@/lib/chat-ui';
import type { TextPart } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isTextPart(part: unknown): part is TextPart {
    return (
        isRecord(part) &&
        part.type === 'text' &&
        typeof part.text === 'string'
    );
}

export function getMessageCreatedAtIso(message: ChatUIMessage): string {
    const metadata = message.metadata as ChatMessageMetadata | undefined;
    const createdAt = metadata?.createdAt;
    if (createdAt instanceof Date) return createdAt.toISOString();
    if (typeof createdAt === 'string') {
        const parsed = new Date(createdAt);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}

export function getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) return error.stack;
    return undefined;
}

/** Helper to extract text from an AI SDK UIMessage. */
export function getTextFromUIMessage(message: ChatUIMessage): string {
    return (message.parts || [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
}

export function extractUrl(text: string): string | null {
    return extractAndNormalizeUrl(text);
}

/** Find the most recent URL in the conversation history */
export function findLastUrlInMessages(messages: ChatUIMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user') {
            if (msg.parts) {
                for (const part of msg.parts) {
                    if (part.type === 'text') {
                        const url = extractUrl(part.text);
                        if (url) return url;
                    }
                }
            }
        }
    }
    return null;
}

const INVALID_TASK_ID = '00000000-0000-0000-0000-000000000000';

export function isUsableTaskId(taskId: string | null | undefined): taskId is string {
    return typeof taskId === 'string' && taskId.length > 0 && taskId !== INVALID_TASK_ID;
}

export function extractTaskIdFromCreateTaskMessages(messages: ChatUIMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!Array.isArray(message.parts)) continue;

        for (const part of message.parts) {
            if (!isRecord(part) || typeof part.type !== 'string') continue;

            const isCreateTaskTool =
                (part.type === 'dynamic-tool' && part.toolName === 'create_task') ||
                (part.type.startsWith('tool-') && part.type.replace('tool-', '') === 'create_task');

            if (!isCreateTaskTool) continue;

            const maybeOutput =
                'output' in part ? (part as { output?: unknown }).output : null;
            const output = isRecord(maybeOutput) ? maybeOutput : null;
            const taskId = output && typeof output.taskId === 'string' ? output.taskId : null;
            if (isUsableTaskId(taskId)) {
                return taskId;
            }
        }
    }
    return null;
}
