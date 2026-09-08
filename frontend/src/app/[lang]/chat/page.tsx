
import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChatPageClient } from "@/components/chat/ChatPageClient"
import { getChatExample, getChatExamples, type ChatExample } from "@/lib/chat-examples"
import { isLocalUiDemo } from "@/lib/local-ui-demo"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n"
import { createTranslator } from "@/lib/i18n-server"
import { LANDING_DEMO } from "@/lib/landing-demo"

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
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams])
    const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
    const selectedTaskId = typeof query.task === "string" ? query.task : null
    const hasThread = typeof query.threadId === "string" && query.threadId.length > 0
    const isLandingTask = selectedTaskId === LANDING_DEMO.id
    const hasLandingLocale = LANDING_DEMO.summaryLocales.some(language => language === locale)
    const isDemo = isLocalUiDemo()
    const shouldLoadExamples = !selectedTaskId && !isDemo
    const initialExamples = shouldLoadExamples ? getChatExamples() : null
    let publicExample: ChatExample | null = null
    if (isLandingTask) {
        if (!hasThread && hasLandingLocale) {
            publicExample = isDemo ? LANDING_DEMO : await getChatExample(LANDING_DEMO.id, locale)
        }
    } else if (selectedTaskId && !isDemo) {
        publicExample = await getChatExample(selectedTaskId)
    }

    // A failed public handoff must not enter private task/thread initialization.
    // Existing conversations still use their normal authenticated restoration.
    if (isLandingTask && !hasThread && !publicExample) {
        const t = createTranslator(locale)
        return (
            <main className="flex min-h-svh items-center justify-center p-6">
                <div className="max-w-md space-y-6 text-center">
                    <h1 className="text-xl font-semibold text-foreground">
                        {t(hasLandingLocale ? "chat.exampleUnavailable" : "chat.exampleLanguageUnavailable")}
                    </h1>
                    <div className="flex flex-wrap justify-center gap-3">
                        {hasLandingLocale ? (
                            <Button asChild variant="outline">
                                <a href={`/${locale}/chat?task=${LANDING_DEMO.id}`}>{t("chat.retry")}</a>
                            </Button>
                        ) : null}
                        <Button asChild variant="supa">
                            <Link href={`/${locale}/chat`}>{t("chat.newChat")}</Link>
                        </Button>
                    </div>
                </div>
            </main>
        )
    }

    return <ChatPageClient initialExamples={initialExamples} publicExample={publicExample} />
}
