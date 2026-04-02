
import type { Metadata } from "next"
import { ChatPageClient } from "@/components/chat/ChatPageClient"

export const metadata: Metadata = {
    title: "Chat",
    description: "Chat with your AI assistant to summarize videos, translate content, and get structured insights.",
    robots: { index: false, follow: false },
}

export default function ChatPage() {
    return <ChatPageClient />
}
