import { type ChatUIMessage, toStoredChatUIMessage } from '@/lib/chat-ui'

export interface DBMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: unknown
    created_at: string
    metadata?: unknown
}

export function mapDBMessageToUIMessage(dbMsg: DBMessage): ChatUIMessage {
    return toStoredChatUIMessage(dbMsg)
}
