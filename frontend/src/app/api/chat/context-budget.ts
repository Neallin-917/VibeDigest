import type { ChatUIMessage } from '@/lib/chat-ui';

export const MAX_HISTORY_MESSAGES = 12;
export const MAX_HISTORY_CHARACTERS = 30_000;

function messageCharacters(message: ChatUIMessage): number {
    try {
        return JSON.stringify(message.parts).length;
    } catch {
        return MAX_HISTORY_CHARACTERS;
    }
}

/** Keep recent complete UI messages so tool calls and results are not split apart. */
export function selectRecentChatMessages(
    messages: ChatUIMessage[],
    maxMessages = MAX_HISTORY_MESSAGES,
    maxCharacters = MAX_HISTORY_CHARACTERS,
): ChatUIMessage[] {
    if (messages.length === 0) return [];

    const selected: ChatUIMessage[] = [];
    let characters = 0;

    for (let index = messages.length - 1; index >= 0 && selected.length < maxMessages; index -= 1) {
        const message = messages[index];
        const nextCharacters = messageCharacters(message);
        if (selected.length > 0 && characters + nextCharacters > maxCharacters) break;
        selected.push(message);
        characters += nextCharacters;
    }

    return selected.reverse();
}
