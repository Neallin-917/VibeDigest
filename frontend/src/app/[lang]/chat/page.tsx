
import type { Metadata } from "next"
import { ChatPageClient } from "@/components/chat/ChatPageClient"
import { getChatExamples } from "@/lib/chat-examples"
import { isLocalUiDemo } from "@/lib/local-ui-demo"

export const metadata: Metadata = {
    title: "Chat",
    description: "Chat with your AI assistant to summarize videos, translate content, and get structured insights.",
    robots: { index: false, follow: false },
}

export default async function ChatPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const shouldLoadExamples = !params.task && !isLocalUiDemo()
    const initialExamples = shouldLoadExamples ? getChatExamples() : null

    return <ChatPageClient initialExamples={initialExamples} />
}
