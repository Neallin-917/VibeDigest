import { describe, expect, it } from 'vitest';

import { createUserTextMessage, type ChatUIMessage } from '@/lib/chat-ui';
import { selectRecentChatMessages } from './context-budget';

describe('selectRecentChatMessages', () => {
    it('keeps the latest complete messages in chronological order', () => {
        const messages = Array.from({ length: 5 }, (_, index) =>
            createUserTextMessage(`m-${index}`, `message-${index}`)
        );

        expect(selectRecentChatMessages(messages, 3, 10_000).map((message) => message.id)).toEqual([
            'm-2', 'm-3', 'm-4',
        ]);
    });

    it('always keeps the latest message even when it exceeds the character budget', () => {
        const messages: ChatUIMessage[] = [
            createUserTextMessage('old', 'old'),
            createUserTextMessage('latest', 'x'.repeat(200)),
        ];

        expect(selectRecentChatMessages(messages, 12, 10).map((message) => message.id)).toEqual([
            'latest',
        ]);
    });
});
