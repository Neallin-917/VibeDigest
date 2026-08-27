
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
    parseCurrentSummary,
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
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react"
import { cache } from "react"
import { TaskFollowUp } from "@/components/tasks/TaskFollowUp"

type Props = {
    params: Promise<{
        lang: string
        id: string
        slug: string
    }>
    searchParams: Promise<{
        fromShow?: string | string[]
        fromQuery?: string | string[]
        threadId?: string | string[]
    }>
}

const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
    const threadId = getSingleSearchParam(returnState.threadId)
    if (/^[a-z0-9-]{1,64}$/.test(source)) params.set("fromShow", source)
    if (query) params.set("fromQuery", query.slice(0, 120))
    if (THREAD_ID_PATTERN.test(threadId)) params.set("threadId", threadId)
    const search = params.toString()
    return search ? `?${search}` : ""
}

function generateSlug(title: string): string {
    if (!title) return "video";
    return encodeURIComponent(title.trim().replace(/\s+/g, '-'));
}

function getSourceLabel(videoUrl: string, author?: string | null) {
    if (author?.trim()) return author.trim()
    try {
        return new URL(videoUrl).hostname.replace(/^www\./, "")
    } catch {
        return videoUrl
    }
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
        back: "Back to podcast library", source: "Source",
        summary: "Summary", keyIdeas: "Key ideas", fullSummary: "Read the full digest", original: "Open Original Video",
        failed: "This task did not complete. You can retry it below.",
        pending: "Summary not available yet. Check back once processing completes.",
        processedVideo: "Processed Video",
        followUp: {
            title: "Ask about this source",
            restoring: "Restoring your latest conversation...",
            restoreFailed: "The previous conversation could not be restored. Start a new one below.",
        },
        status: { completed: "Completed", processing: "Processing", pending: "Queued", failed: "Failed" },
    },
    zh: {
        back: "返回播客库", source: "来源",
        summary: "内容摘要", keyIdeas: "关键观点", fullSummary: "完整整理", original: "打开原视频",
        failed: "这项任务未能完成，可以在下方重试。",
        pending: "整理内容尚未生成，请在处理完成后回来查看。",
        processedVideo: "已处理视频",
        followUp: {
            title: "基于本期内容继续追问",
            restoring: "正在恢复最近的对话...",
            restoreFailed: "未能恢复之前的对话，可以在下方开始新对话。",
        },
        status: { completed: "已完成", processing: "处理中", pending: "排队中", failed: "失败" },
    },
    ja: {
        back: "ポッドキャスト一覧に戻る", source: "出典",
        summary: "要約", keyIdeas: "重要ポイント", fullSummary: "整理内容をすべて読む", original: "元の動画を開く",
        failed: "このタスクは完了しませんでした。下から再試行できます。",
        pending: "整理内容はまだありません。処理完了後にもう一度確認してください。",
        processedVideo: "処理済み動画",
        followUp: {
            title: "この内容について質問する",
            restoring: "最近の会話を復元しています...",
            restoreFailed: "以前の会話を復元できませんでした。下から新しい会話を始められます。",
        },
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
        .select('id, video_title, video_url, thumbnail_url, author, status, is_demo')
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
    const fallbackDescription = `View the AI-generated summary and key ideas for "${task.video_title || 'this video'}".`
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
    const structuredSummary = summaryOutput ? parseCurrentSummary(summaryOutput.content) : null
    const hasSummary = Boolean(summaryMarkdown)
    const summaryExcerpt = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 200, locale) : ""
    const leadSummary = structuredSummary?.tl_dr || structuredSummary?.overview || summaryExcerpt
    const leadKeypoints = structuredSummary?.keypoints.slice(0, 3) ?? []
    const title = task.video_title || copy.processedVideo
    const displayTitle = title.replaceAll("—", "-")
    const status = normalizeTaskStatus(task.status)
    const initialThreadId = getSingleSearchParam(returnState.threadId)
    const sourceLabel = task.video_url ? getSourceLabel(task.video_url, task.author) : ""
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
        <div className="relative z-10 min-h-0 w-full flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 md:pb-8">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="mx-auto max-w-6xl">
                <header className="border-b border-border/70 pb-6">
                    <Link
                        href={buildLibraryHref(locale, returnState)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {copy.back}
                    </Link>
                    {status !== "completed" && (
                        <div className="mt-3">
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </div>
                    )}
                    <Heading
                        as="h1"
                        variant="display"
                        className="mt-3 max-w-[68rem] text-3xl leading-[1.08] tracking-[-0.035em] sm:text-4xl md:text-5xl"
                    >
                        {displayTitle}
                    </Heading>
                </header>

                <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
                    <main className="min-w-0 space-y-8">
                        <section className="space-y-3" aria-labelledby="task-summary-title">
                            <Heading as="h2" variant="h2" id="task-summary-title">
                                {copy.summary}
                            </Heading>
                            {hasSummary ? (
                                <p className="max-w-[46rem] text-base font-medium leading-7 text-foreground md:text-lg md:leading-8">
                                    {leadSummary}
                                </p>
                            ) : (
                                <Text tone="muted">
                                    {status === "failed"
                                        ? copy.failed
                                        : copy.pending}
                                </Text>
                            )}
                        </section>

                        <TaskFollowUp
                            taskId={id}
                            taskStatus={status}
                            videoTitle={title}
                            videoUrl={task.video_url}
                            thumbnailUrl={task.thumbnail_url}
                            initialThreadId={THREAD_ID_PATTERN.test(initialThreadId) ? initialThreadId : null}
                            copy={copy.followUp}
                        />

                        {leadKeypoints.length > 0 && (
                            <section className="space-y-5 border-t border-border/70 pt-7">
                                <Heading as="h2" variant="h2">{copy.keyIdeas}</Heading>
                                <ol className="space-y-6">
                                    {leadKeypoints.map((keypoint, index) => (
                                        <li
                                            key={`${keypoint.title}-${index}`}
                                            className="grid max-w-[46rem] grid-cols-[1.75rem_minmax(0,1fr)] gap-3 md:gap-4"
                                        >
                                            <span className="pt-0.5 text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                            <div>
                                                <p className="text-sm font-semibold leading-6 text-foreground md:text-base">{keypoint.title}</p>
                                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                                    {keypoint.why_it_matters || keypoint.detail}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}

                        {hasSummary && (
                            <details className="group border-y border-border/70">
                                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                    <span>{copy.fullSummary}</span>
                                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                                </summary>
                                <div className="border-t border-border/70 py-7">
                                    <div className="prose prose-sm max-w-none prose-slate dark:prose-invert md:prose-base">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {summaryMarkdown}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </details>
                        )}
                    </main>

                    <aside className="space-y-4 lg:sticky lg:top-24" aria-label={copy.source}>
                        {task.thumbnail_url && (
                            <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface-raised/40">
                                {/* eslint-disable-next-line @next/next/no-img-element -- external dynamic thumbnail URL is rendered directly without Next image optimization */}
                                <img
                                    src={task.thumbnail_url}
                                    alt={displayTitle}
                                    className="aspect-video w-full object-cover"
                                />
                            </div>
                        )}
                        {sourceLabel && (
                            <div className="space-y-1 px-1">
                                <p className="text-xs text-muted-foreground">{copy.source}</p>
                                <p className="break-words text-sm font-medium text-foreground">{sourceLabel}</p>
                            </div>
                        )}
                        {task.video_url && (
                            <a
                                href={task.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(buttonVariants({ variant: "outline" }), "w-full gap-2")}
                            >
                                {copy.original}
                                <ExternalLink className="size-3.5" aria-hidden="true" />
                            </a>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    )
}
