
import type { Metadata } from "next"
import { ChatPageClient } from "@/components/chat/ChatPageClient"
import { getChatExample, getChatExamples } from "@/lib/chat-examples"
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
    const selectedTaskId = typeof params.task === "string" ? params.task : null
    const shouldLoadExamples = !selectedTaskId && !isLocalUiDemo()
    const initialExamples = shouldLoadExamples ? getChatExamples() : null
    const publicExample = selectedTaskId && !isLocalUiDemo()
        ? await getChatExample(selectedTaskId)
        : null

    return <ChatPageClient initialExamples={initialExamples} publicExample={publicExample} />
}
