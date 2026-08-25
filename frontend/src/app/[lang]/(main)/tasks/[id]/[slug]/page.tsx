
import { createClient } from "@/lib/supabase-server"
import type { Metadata, ResolvingMetadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import {
    buildSummaryExcerptFromContent,
    buildSummaryMarkdownFromContent,
    pickPreferredSummaryOutput,
    type SummaryOutputCandidate,
} from "@/lib/summary-contract"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Heading, Text } from "@/components/ui/typography"
import { cn } from "@/lib/utils"
import { normalizeTaskStatus } from "@/lib/safe-error"
import { isLocale } from "@/lib/i18n"
import { shouldUseDemoFixtures } from "@/lib/local-ui-demo"
import { getDemoFixtureTask } from "@/components/templates/demoFixtures"
import { ArrowLeft } from "lucide-react"
import { cache } from "react"
import { TranscriptPanel } from "@/components/tasks/TranscriptPanel"

type Props = {
    params: Promise<{
        lang: string
        id: string
        slug: string
    }>
    searchParams: Promise<{
        fromShow?: string | string[]
        fromQuery?: string | string[]
    }>
}

function getSingleSearchParam(value: string | string[] | undefined) {
    return typeof value === "string" ? value : ""
}

function buildLibraryHref(locale: string, returnState: Awaited<Props["searchParams"]>) {
    const params = new URLSearchParams()
    const source = getSingleSearchParam(returnState.fromShow)
    const query = getSingleSearchParam(returnState.fromQuery)
    if (/^[a-z0-9-]{1,64}$/.test(source)) params.set("show", source)
    if (query) params.set("q", query.slice(0, 120))
    const search = params.toString()
    return `/${locale}/explore${search ? `?${search}` : ""}`
}

function buildReturnSuffix(returnState: Awaited<Props["searchParams"]>) {
    const params = new URLSearchParams()
    const source = getSingleSearchParam(returnState.fromShow)
    const query = getSingleSearchParam(returnState.fromQuery)
    if (/^[a-z0-9-]{1,64}$/.test(source)) params.set("fromShow", source)
    if (query) params.set("fromQuery", query.slice(0, 120))
    const search = params.toString()
    return search ? `?${search}` : ""
}

function generateSlug(title: string): string {
    if (!title) return "video";
    return encodeURIComponent(title.trim().replace(/\s+/g, '-'));
}

type TaskOutput = {
    kind: string
    content: unknown
    status: string | null
    locale?: string | null
    created_at?: string | null
}

const DETAIL_COPY = {
    en: {
        back: "Back to podcast library", communityExample: "Community example", source: "Source",
        summary: "Summary", startChat: "Start Chat", continueChat: "Continue in Chat", original: "Open Original Video",
        failed: "This task did not complete. Continue in chat to retry it.",
        pending: "Summary not available yet. Check back once processing completes.",
        processedVideo: "Processed Video",
        status: { completed: "Completed", processing: "Processing", pending: "Queued", failed: "Failed" },
    },
    zh: {
        back: "返回播客库", communityExample: "社区内容", source: "原始内容",
        summary: "内容整理", startChat: "继续追问", continueChat: "在对话中重试", original: "打开原视频",
        failed: "这项任务未能完成。请进入对话后重试。",
        pending: "整理内容尚未生成，请在处理完成后回来查看。",
        processedVideo: "已处理视频",
        status: { completed: "已完成", processing: "处理中", pending: "排队中", failed: "失败" },
    },
    ja: {
        back: "ポッドキャスト一覧に戻る", communityExample: "コミュニティコンテンツ", source: "元の内容",
        summary: "整理内容", startChat: "続けて質問する", continueChat: "チャットで再試行", original: "元の動画を開く",
        failed: "このタスクは完了しませんでした。チャットで再試行してください。",
        pending: "整理内容はまだありません。処理完了後にもう一度確認してください。",
        processedVideo: "処理済み動画",
        status: { completed: "完了", processing: "処理中", pending: "待機中", failed: "失敗" },
    },
} as const

const getTaskAndOutputs = cache(async (id: string, lang: string) => {
    if (shouldUseDemoFixtures() && isLocale(lang)) {
        const fixture = getDemoFixtureTask(id, lang)
        if (fixture) {
            return {
                task: { ...fixture, is_demo: true },
                outputs: (fixture.task_outputs || []) as TaskOutput[],
            }
        }
    }

    const supabase = await createClient()

    // Fetch task
    const { data: task } = await supabase
        .from('tasks')
        .select('id, video_title, video_url, thumbnail_url, status, is_demo')
        .eq('id', id)
        .single()

    // Fetch outputs if task exists
    let outputs: TaskOutput[] = []
    if (task) {
        const { data } = await supabase
            .from('task_outputs')
            .select('kind, content, status, locale, created_at')
            .eq('task_id', id)
            .eq('kind', 'summary')
            .order('created_at', { ascending: false })
        outputs = data || []
    }

    return { task, outputs }
})

export async function generateMetadata(
    props: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const params = await props.params;
    const { id, lang } = params
    const { task, outputs } = await getTaskAndOutputs(id, lang)

    if (!task) {
        return {
            title: "Task Not Found",
        }
    }

    const previousImages = (await parent).openGraph?.images || []

    // Construct canonical and alternates
    // We assume the current slug is correct (validity checked in Page component, but for metadata we should use the "correct" one ideally)
    const currentSlug = generateSlug(task.video_title || "video");

    const path = `/tasks/${id}/${currentSlug}`
    const shouldIndex = task.is_demo === true && task.status === "completed"
    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[], lang)
    const summaryText = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 160, lang) : ""
    const fallbackDescription = `View the AI-generated summary and transcript for "${task.video_title || 'this video'}".`
    const description = summaryText || fallbackDescription

    return {
        title: task.video_title || "Processed Video",
        description,
        openGraph: {
            title: task.video_title || "Processed Video",
            description,
            images: task.thumbnail_url ? [task.thumbnail_url, ...previousImages] : previousImages,
            url: buildLocalizedPath(lang, path),
            type: "article",
        },
        alternates: {
            canonical: buildLocalizedPath(lang, path),
            languages: buildAlternateLanguages(path),
        },
        robots: shouldIndex
            ? { index: true, follow: true }
            : { index: false, follow: false },
    }
}

export default async function TaskDetailPage(props: Props) {
    const [params, returnState] = await Promise.all([props.params, props.searchParams])
    const { id, lang, slug } = params
    const locale = isLocale(lang) ? lang : "en"
    const copy = DETAIL_COPY[locale]
    const { task, outputs } = await getTaskAndOutputs(id, lang)

    if (!task) {
        notFound()
    }

    // SLUG ENFORCEMENT
    const correctSlug = generateSlug(task.video_title || "video");
    if (slug !== correctSlug) {
        redirect(`/${lang}/tasks/${id}/${correctSlug}${buildReturnSuffix(returnState)}`);
    }

    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[], locale)
    const summaryMarkdown = summaryOutput ? buildSummaryMarkdownFromContent(summaryOutput.content, locale) : ""
    const hasSummary = Boolean(summaryMarkdown)
    const summaryExcerpt = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 200, locale) : ""
    const title = task.video_title || copy.processedVideo
    const chatPath = `/${lang}/chat?task=${id}`
    const status = normalizeTaskStatus(task.status)
    const canonicalUrl = buildLocalizedPath(lang, `/tasks/${id}/${correctSlug}`)
    const articleJsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description: summaryExcerpt || `AI summary of ${title}.`,
        mainEntityOfPage: canonicalUrl,
        url: canonicalUrl,
        author: {
            "@type": "Organization",
            name: "VibeDigest",
        },
        publisher: {
            "@type": "Organization",
            name: "VibeDigest",
        },
    }
    if (task.thumbnail_url) {
        articleJsonLd.image = [task.thumbnail_url]
    }
    if (task.video_url) {
        articleJsonLd.about = {
            "@type": "CreativeWork",
            url: task.video_url,
        }
    }
    const videoJsonLd = task.video_url
        ? {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            name: title,
            description: summaryExcerpt || `AI summary of ${title}.`,
            url: canonicalUrl,
            contentUrl: task.video_url,
            thumbnailUrl: task.thumbnail_url ? [task.thumbnail_url] : undefined,
        }
        : null
    const jsonLd = videoJsonLd ? [articleJsonLd, videoJsonLd] : articleJsonLd
    const statusVariantMap: Record<string, "success" | "processing" | "secondary" | "destructive"> = {
        completed: "success",
        processing: "processing",
        pending: "secondary",
        failed: "destructive",
    }
    const statusLabel = copy.status[status as keyof typeof copy.status] || copy.status.processing
    const statusVariant = statusVariantMap[status] || "processing"

    return (
        <div className="relative z-10 min-h-0 w-full flex-1 overflow-y-auto px-6 pb-24 pt-8 md:pb-8">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="mx-auto max-w-6xl space-y-8">
                <header className="space-y-4">
                    <Link
                        href={buildLibraryHref(locale, returnState)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {copy.back}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                        {task.is_demo && (
                            <Badge variant="outline">{copy.communityExample}</Badge>
                        )}
                    </div>
                    <Heading as="h1" variant="display" className="text-balance">
                        {title}
                    </Heading>
                    {task.video_url && (
                        <Text tone="muted" className="break-all">
                            {copy.source}:{" "}
                            <a
                                href={task.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                                {task.video_url}
                            </a>
                        </Text>
                    )}
                </header>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <section className="glass-panel p-6 space-y-4">
                        <Heading as="h2" variant="h2">
                            {copy.summary}
                        </Heading>
                        {hasSummary ? (
                            <div className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {summaryMarkdown}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <Text tone="muted">
                                {status === "failed"
                                    ? copy.failed
                                    : copy.pending}
                            </Text>
                        )}
                    </section>

                    <aside className="space-y-4">
                        {task.thumbnail_url && (
                            <div className="glass-panel p-3">
                                {/* eslint-disable-next-line @next/next/no-img-element -- external dynamic thumbnail URL is rendered directly without Next image optimization */}
                                <img
                                    src={task.thumbnail_url}
                                    alt={title}
                                    className="w-full rounded-xl object-cover"
                                />
                            </div>
                        )}
                        <div className="glass-panel p-4 space-y-3">
                            <Link
                                href={chatPath}
                                className={cn(buttonVariants({ variant: "default" }), "w-full")}
                            >
                                {status === "failed" ? copy.continueChat : copy.startChat}
                            </Link>
                            {task.video_url && (
                                <a
                                    href={task.video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                                >
                                    {copy.original}
                                </a>
                            )}
                        </div>
                    </aside>
                </div>

                {status === "completed" && (
                    <TranscriptPanel taskId={id} locale={locale} />
                )}
            </div>
        </div>
    )
}
