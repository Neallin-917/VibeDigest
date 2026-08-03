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

const INVALID_TASK_ID = '00000000-0000-0000-0000-000000000000';

export function isUsableTaskId(taskId: string | null | undefined): taskId is string {
    return typeof taskId === 'string' && taskId.length > 0 && taskId !== INVALID_TASK_ID;
}
