
import { createClient } from "@/lib/supabase-server"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { buildLocalizedPath } from "@/lib/seo"
import {
    buildDetailedSummaryMarkdownFromContent,
    buildSummaryExcerptFromContent,
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
import { ArrowDown, ArrowLeft, ChevronDown, ExternalLink, MessageCircleQuestion } from "lucide-react"
import { cache } from "react"
import { TaskFollowUp } from "@/components/tasks/TaskFollowUp"
import { PublicDigestActions } from "@/components/tasks/PublicDigestActions"
import {
    buildPublicTaskJsonLd,
    buildPublicTaskMetadata,
    buildTaskSlug,
    isPublishedPublicTask,
    resolveSummaryLanguageTag,
    serializeJsonLd,
} from "@/lib/public-task-seo"

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

function getSourceLabel(videoUrl: string, author?: string | null) {
    if (author?.trim()) return author.trim()
    try {
        return new URL(videoUrl).hostname.replace(/^www\./, "")
    } catch {
        return videoUrl
    }
}

function getOptionalString(value: unknown, key: string) {
    if (!value || typeof value !== "object") return ""
    const candidate = (value as Record<string, unknown>)[key]
    return typeof candidate === "string" ? candidate.trim() : ""
}

function getOptionalNumber(value: unknown, key: string) {
    if (!value || typeof value !== "object") return null
    const candidate = (value as Record<string, unknown>)[key]
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null
}

function formatDuration(seconds: number | null, locale: "en" | "zh" | "ja") {
    if (seconds === null || seconds <= 0) return ""
    const totalMinutes = Math.max(1, Math.round(seconds / 60))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
        if (locale === "zh") return `${minutes} 分钟`
        if (locale === "ja") return `${minutes}分`
        return `${minutes} min`
    }

    if (locale === "zh") return `${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}`
    if (locale === "ja") return `${hours}時間${minutes ? `${minutes}分` : ""}`
    return `${hours} hr${minutes ? ` ${minutes} min` : ""}`
}

function formatSourceDate(value: string, locale: "en" | "zh" | "ja") {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US"
    return new Intl.DateTimeFormat(dateLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date)
}

function formatTimestamp(seconds: number) {
    const totalSeconds = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainder = totalSeconds % 60
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`
}

function buildTimestampUrl(videoUrl: string, seconds: number) {
    try {
        const url = new URL(videoUrl)
        if (url.hostname === "youtu.be" || url.hostname.endsWith("youtube.com")) {
            url.searchParams.set("t", `${Math.max(0, Math.floor(seconds))}s`)
            return url.toString()
        }
    } catch {
        return videoUrl
    }
    return videoUrl
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
        share: "Copy share link", copied: "Copied", copyFailed: "Copy failed",
        whyItMatters: "Why it matters", evidence: "Supporting evidence", openAt: "Open source at",
        failed: "This task did not complete. You can retry it below.",
        pending: "Summary not available yet. Check back once processing completes.",
        processedVideo: "Processed Video",
        followUp: {
            title: "Ask about this source",
            discovery: "Continue with a question",
            example: "For example: Which evidence supports this conclusion?",
            restoring: "Restoring your latest conversation...",
            restoreFailed: "The previous conversation could not be restored. Start a new one below.",
        },
        status: { completed: "Completed", processing: "Processing", pending: "Queued", failed: "Failed" },
    },
    zh: {
        back: "返回播客库", source: "来源",
        summary: "内容摘要", keyIdeas: "关键观点", fullSummary: "完整整理", original: "打开原视频",
        share: "复制分享链接", copied: "已复制", copyFailed: "复制失败",
        whyItMatters: "为什么重要", evidence: "支撑证据", openAt: "打开原视频时间点",
        failed: "这项任务未能完成，可以在下方重试。",
        pending: "整理内容尚未生成，请在处理完成后回来查看。",
        processedVideo: "已处理视频",
        followUp: {
            title: "基于本期内容继续追问",
            discovery: "读完后继续追问",
            example: "例如：哪些证据支持这个结论？",
            restoring: "正在恢复最近的对话...",
            restoreFailed: "未能恢复之前的对话，可以在下方开始新对话。",
        },
        status: { completed: "已完成", processing: "处理中", pending: "排队中", failed: "失败" },
    },
    ja: {
        back: "ポッドキャスト一覧に戻る", source: "出典",
        summary: "要約", keyIdeas: "重要ポイント", fullSummary: "整理内容をすべて読む", original: "元の動画を開く",
        share: "共有リンクをコピー", copied: "コピー済み", copyFailed: "コピーできませんでした",
        whyItMatters: "重要な理由", evidence: "根拠", openAt: "元の動画を開く",
        failed: "このタスクは完了しませんでした。下から再試行できます。",
        pending: "整理内容はまだありません。処理完了後にもう一度確認してください。",
        processedVideo: "処理済み動画",
        followUp: {
            title: "この内容について質問する",
            discovery: "読み終えたら追加で質問",
            example: "例：この結論を支える根拠は？",
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
        .select('id, video_title, video_url, thumbnail_url, author, author_url, duration, upload_date, status, is_demo, publication_status, podcast_source_slug, published_at, updated_at')
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

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    const { id, lang } = params
    const { task, outputs } = await getTaskAndOutputs(id, lang)

    if (!task) {
        return {
            title: "Task Not Found",
        }
    }

    const locale = isLocale(lang) ? lang : "en"
    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[], locale)
    const structuredSummary = summaryOutput ? parseCurrentSummary(summaryOutput.content) : null
    const summaryText = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 160, locale) : ""

    return buildPublicTaskMetadata({
        locale,
        task: { ...task, id },
        summary: summaryText,
        summaryLanguage: structuredSummary?.language,
        hasCompletedSummary: Boolean(summaryOutput),
    })
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
    const correctSlug = buildTaskSlug(task.video_title)
    if (slug !== correctSlug) {
        redirect(`/${lang}/tasks/${id}/${correctSlug}${buildReturnSuffix(returnState)}`);
    }

    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[], locale)
    const detailedSummaryMarkdown = summaryOutput
        ? buildDetailedSummaryMarkdownFromContent(summaryOutput.content, locale)
        : ""
    const structuredSummary = summaryOutput ? parseCurrentSummary(summaryOutput.content) : null
    const hasSummary = Boolean(structuredSummary)
    const summaryExcerpt = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 200, locale) : ""
    const leadSummary = structuredSummary?.tl_dr || structuredSummary?.overview || summaryExcerpt
    const leadKeypoints = structuredSummary?.keypoints.slice(0, 3) ?? []
    const title = task.video_title || copy.processedVideo
    const displayTitle = title.replaceAll("—", "-")
    const status = normalizeTaskStatus(task.status)
    const initialThreadId = getSingleSearchParam(returnState.threadId)
    const sourceLabel = task.video_url ? getSourceLabel(task.video_url, task.author) : ""
    const sourceId = getOptionalString(task, "podcast_source_slug") || sourceLabel || "unknown"
    const sourceAuthorUrl = getOptionalString(task, "author_url")
    const sourceDuration = getOptionalString(task, "durationLabel") || formatDuration(getOptionalNumber(task, "duration"), locale)
    const sourceUploadDate = getOptionalString(task, "upload_date")
    const sourceDateLabel = formatSourceDate(sourceUploadDate, locale)
    const canonicalUrl = buildLocalizedPath(locale, `/tasks/${id}/${correctSlug}`)
    const isPublicDigest = isPublishedPublicTask(task, Boolean(summaryOutput))
    const jsonLd = isPublicDigest
        ? buildPublicTaskJsonLd({
            locale,
            task: { ...task, id },
            canonicalUrl,
            description: summaryExcerpt || leadSummary || title,
            contentLanguage: structuredSummary?.language,
        })
        : null
    const summaryLanguageTag = resolveSummaryLanguageTag(structuredSummary?.language, locale)
    const statusVariantMap: Record<string, "success" | "processing" | "secondary" | "destructive"> = {
        completed: "success",
        processing: "processing",
        pending: "secondary",
        failed: "destructive",
    }
    const statusLabel = copy.status[status as keyof typeof copy.status] || copy.status.processing
    const statusVariant = statusVariantMap[status] || "processing"

    return (
        <div className="relative z-10 min-h-0 w-full flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-12">
            {jsonLd ? (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
                />
            ) : null}
            <div className="mx-auto max-w-6xl">
                <header className="border-b border-border/70 pb-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link
                            href={buildLibraryHref(locale, returnState)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-full text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            {copy.back}
                        </Link>
                        {isPublicDigest ? (
                            <PublicDigestActions
                                locale={locale}
                                source={sourceId}
                                canonicalUrl={canonicalUrl}
                                copy={{
                                    share: copy.share,
                                    copied: copy.copied,
                                    copyFailed: copy.copyFailed,
                                }}
                            />
                        ) : null}
                    </div>
                    {status !== "completed" && (
                        <div className="mt-3">
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </div>
                    )}
                    <Heading
                        as="h1"
                        variant="display"
                        className="mt-3 max-w-[64rem] text-3xl leading-[1.1] tracking-[-0.03em] sm:text-4xl lg:text-[2.75rem]"
                    >
                        {displayTitle}
                    </Heading>
                    {(sourceLabel || sourceDuration || sourceDateLabel) && (
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            {sourceLabel && <span className="font-medium text-foreground/80">{sourceLabel}</span>}
                            {sourceDuration && <span className="border-l border-border pl-3">{sourceDuration}</span>}
                            {sourceDateLabel && (
                                <time className="border-l border-border pl-3" dateTime={sourceUploadDate}>
                                    {sourceDateLabel}
                                </time>
                            )}
                        </div>
                    )}
                    {hasSummary && (
                        <a
                            href="#task-follow-up"
                            data-slot="follow-up-discovery-anchor"
                            className="mt-5 inline-flex min-h-11 max-w-xl items-center gap-3 border-l-2 border-emerald-600/45 pl-3 text-left motion-safe:transition-colors hover:border-emerald-600 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-400/45 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                        >
                            <MessageCircleQuestion className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {copy.followUp.discovery}
                                </span>
                                <span className="mt-0.5 block text-sm leading-5 text-foreground/80">
                                    {copy.followUp.example}
                                </span>
                            </span>
                            <ArrowDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </a>
                    )}
                </header>

                <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-14 lg:gap-y-12">
                    <article lang={summaryLanguageTag} className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
                        <section className="space-y-3" aria-labelledby="task-summary-title">
                            <Heading as="h2" variant="h2" id="task-summary-title" className="scroll-mt-28">
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

                        {leadKeypoints.length > 0 && (
                            <section className="space-y-5 border-t border-border/70 pt-8" aria-labelledby="task-key-ideas-title">
                                <Heading as="h2" variant="h2" id="task-key-ideas-title" className="scroll-mt-28">
                                    {copy.keyIdeas}
                                </Heading>
                                <ol className="space-y-7">
                                    {leadKeypoints.map((keypoint, index) => (
                                        <li
                                            key={`${keypoint.title}-${index}`}
                                            className="grid max-w-[46rem] grid-cols-[1.75rem_minmax(0,1fr)] gap-3 md:gap-4"
                                        >
                                            <span className="pt-0.5 text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold leading-6 text-foreground md:text-base">{keypoint.title}</p>
                                                <p className="mt-1 text-sm leading-6 text-muted-foreground">{keypoint.detail}</p>
                                                {keypoint.why_it_matters && (
                                                    <p className="mt-3 text-sm leading-6 text-foreground/80">
                                                        <span className="font-semibold">{copy.whyItMatters}: </span>
                                                        {keypoint.why_it_matters}
                                                    </p>
                                                )}
                                                <details className="group/evidence mt-3 border-l-2 border-emerald-500/45 pl-3">
                                                    <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-emerald-700 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400">
                                                        <span>{copy.evidence}</span>
                                                        {typeof keypoint.startSeconds === "number" && task.video_url && (
                                                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono font-medium tabular-nums">
                                                                {formatTimestamp(keypoint.startSeconds)}
                                                            </span>
                                                        )}
                                                        <ChevronDown className="ml-auto size-3.5 transition-transform group-open/evidence:rotate-180" aria-hidden="true" />
                                                    </summary>
                                                    <p className="pb-1 pt-2 text-sm leading-6 text-muted-foreground">{keypoint.evidence}</p>
                                                    {typeof keypoint.startSeconds === "number" && task.video_url && (
                                                        <a
                                                            href={buildTimestampUrl(task.video_url, keypoint.startSeconds)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="mb-1 inline-flex min-h-8 items-center rounded-full text-xs font-semibold text-emerald-700 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-400"
                                                        >
                                                            {copy.openAt} {formatTimestamp(keypoint.startSeconds)}
                                                            <ExternalLink className="ml-1.5 size-3" aria-hidden="true" />
                                                        </a>
                                                    )}
                                                </details>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}
                    </article>

                    <aside className="space-y-4 border-t border-border/70 pt-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:border-t-0 lg:pt-0" aria-labelledby="task-source-title">
                        <Heading as="h2" variant="h3" id="task-source-title" className="scroll-mt-28">
                            {copy.source}
                        </Heading>
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
                                {sourceAuthorUrl ? (
                                    <a href={sourceAuthorUrl} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-medium text-foreground hover:text-emerald-700 dark:hover:text-emerald-400">
                                        {sourceLabel}
                                    </a>
                                ) : (
                                    <p className="break-words text-sm font-medium text-foreground">{sourceLabel}</p>
                                )}
                                {(sourceDuration || sourceDateLabel) && (
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        {[sourceDuration, sourceDateLabel].filter(Boolean).join(" · ")}
                                    </p>
                                )}
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

                    {detailedSummaryMarkdown && (
                        <details className="group min-w-0 border-y border-border/70 lg:col-start-1">
                            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                <span>{copy.fullSummary}</span>
                                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                            </summary>
                            <div className="border-t border-border/70 py-7">
                                <div className="prose prose-sm max-w-none prose-slate dark:prose-invert md:prose-base">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {detailedSummaryMarkdown}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </details>
                    )}

                    <div id="task-follow-up" className="min-w-0 scroll-mt-24 lg:col-start-1">
                        <TaskFollowUp
                            taskId={id}
                            taskStatus={status}
                            videoTitle={title}
                            videoUrl={task.video_url}
                            thumbnailUrl={task.thumbnail_url}
                            initialThreadId={THREAD_ID_PATTERN.test(initialThreadId) ? initialThreadId : null}
                            copy={copy.followUp}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
