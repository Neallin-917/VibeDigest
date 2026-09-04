
import type { Metadata } from "next"
import { ChatPageClient } from "@/components/chat/ChatPageClient"
import { getChatExample, getChatExamples } from "@/lib/chat-examples"
import { isLocalUiDemo } from "@/lib/local-ui-demo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: string }>
}): Promise<Metadata> {
    const { lang } = await params
    const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
    const t = createTranslator(locale)

    return {
        title: t("metadata.chat.title"),
        description: t("metadata.chat.description"),
        robots: { index: false, follow: false },
    }
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
