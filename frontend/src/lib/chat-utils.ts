import { type ChatUIMessage, toStoredChatUIMessage } from '@/lib/chat-ui'

export interface DBMessage {
    id: string
    role: 'user' | 'assistant' | 'system' | 'data' | 'tool'
    content: unknown
    created_at: string
}

export function mapDBMessageToUIMessage(dbMsg: DBMessage): ChatUIMessage {
    return toStoredChatUIMessage(dbMsg)
}
