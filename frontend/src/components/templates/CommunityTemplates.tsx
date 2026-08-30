"use client"

import { useDeferredValue, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cva } from "class-variance-authority"
import { ChevronDown, ExternalLink, Search } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import { trackGrowthEvent } from "@/lib/growth-events"
import { findPodcastSource, type PodcastSource } from "@/lib/podcast-sources"
import { buildTaskSlug } from "@/lib/task-path"
import { cn } from "@/lib/utils"

export type TaskOutput = {
    kind: string
    content: unknown
    status?: string | null
    locale?: string | null
    created_at?: string | null
}

export type Task = {
    id: string
    video_url: string
    video_title?: string
    thumbnail_url?: string
    status: string
    created_at: string
    updated_at?: string
    published_at?: string
    is_demo?: boolean
    publication_status?: string
    author?: string
    author_image_url?: string
    task_outputs?: TaskOutput[]
    takeaway?: string
    keyPointCount?: number
    durationLabel?: string
    source?: PodcastSource
}

export type SourceShelfItem = {
    source: PodcastSource
    count: number
}

export type CommunityTemplatesLayout = "gallery" | "landingPreview"

export type CommunityTemplatesIntro = {
    eyebrow: string
    title: string
    description: string
}

type CommunityCopy = {
    loading: string
    title: string
    hint: string
    unavailable: string
}

type PodcastCopy = {
    sourceShelf: string
    all: string
    showAll: string
    showLess: string
    curated: string
    recent: string
    read: string
    source: string
    search: string
    searchPlaceholder: string
    empty: string
    clearFilters: string
    loadMore: string
    episodeUnit: string
    keyPointUnit: string
    resultCount: string
}

const PODCAST_COPY: Record<Locale, PodcastCopy> = {
    en: {
        sourceShelf: "Browse by show",
        all: "All",
        showAll: "Browse all shows",
        showLess: "Show less",
        curated: "Ready to read",
        recent: "More organized episodes",
        read: "View digest",
        source: "Original episode",
        search: "Search content",
        searchPlaceholder: "Search by episode, show, guest, or topic",
        empty: "No finished digests match this filter yet.",
        clearFilters: "Clear filters",
        loadMore: "Load more",
        episodeUnit: "digests",
        keyPointUnit: "key points",
        resultCount: "digests ready",
    },
    zh: {
        sourceShelf: "按节目浏览",
        all: "全部",
        showAll: "浏览全部节目",
        showLess: "收起节目",
        curated: "可以直接阅读",
        recent: "更多整理内容",
        read: "查看整理",
        source: "原节目",
        search: "搜索内容",
        searchPlaceholder: "输入节目、嘉宾或主题",
        empty: "没有符合当前筛选的整理内容。",
        clearFilters: "清除筛选",
        loadMore: "加载更多",
        episodeUnit: "期整理",
        keyPointUnit: "个关键观点",
        resultCount: "条已整理内容",
    },
    ja: {
        sourceShelf: "番組から探す",
        all: "すべて",
        showAll: "すべての番組を見る",
        showLess: "折りたたむ",
        curated: "すぐに読める整理内容",
        recent: "その他の整理内容",
        read: "整理内容を見る",
        source: "元のエピソード",
        search: "内容を検索",
        searchPlaceholder: "エピソード、番組、ゲスト、トピックを検索",
        empty: "現在の条件に一致する整理内容はありません。",
        clearFilters: "絞り込みを解除",
        loadMore: "さらに読み込む",
        episodeUnit: "件の整理",
        keyPointUnit: "の要点",
        resultCount: "件の整理済み",
    },
}

const localeDateTag: Record<Locale, string> = { en: "en-US", zh: "zh-CN", ja: "ja-JP" }
const FEATURED_COUNT = 6

type EpisodeCardRole = "hero" | "supporting" | "solo" | "standard"

const episodeCardVariants = cva(
    "group h-full overflow-hidden border border-border bg-card/80 transition-colors hover:border-primary-muted/60",
    {
        variants: {
            role: {
                hero: "flex min-h-[25rem] flex-col lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]",
                supporting: "grid min-h-[18rem] grid-rows-[minmax(0,1fr)_auto] lg:min-h-0",
                solo: "flex min-h-[20rem] flex-col lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]",
                standard: "flex min-h-[18rem] flex-col",
            },
        },
        defaultVariants: {
            role: "standard",
        },
    }
)

const episodeMediaVariants = cva(
    "relative block overflow-hidden bg-muted",
    {
        variants: {
            role: {
                hero: "aspect-[1.38/1] lg:aspect-[1.55/1]",
                supporting: "aspect-[16/10] lg:aspect-[5/2] lg:min-h-0",
                solo: "aspect-video lg:aspect-auto lg:min-h-[22rem]",
                standard: "aspect-[16/10]",
            },
        },
        defaultVariants: {
            role: "standard",
        },
    }
)

const episodeContentVariants = cva("flex flex-col px-4 pb-4 pt-3", {
    variants: {
        role: {
            hero: "flex-1 lg:flex-none",
            supporting: "flex-none py-3",
            solo: "flex-1",
            standard: "flex-1",
        },
    },
    defaultVariants: {
        role: "standard",
    },
})

const episodeFooterVariants = cva("flex items-center justify-between gap-3", {
    variants: {
        role: {
            hero: "mt-4",
            supporting: "mt-3 border-t border-border pt-3",
            solo: "mt-auto pt-4",
            standard: "mt-auto pt-4",
        },
    },
    defaultVariants: {
        role: "standard",
    },
})

function taskDetailHref(task: Task, locale: Locale, sourceId = "all", query = "") {
    const slug = buildTaskSlug(task.video_title || "podcast")
    const returnState = new URLSearchParams()
    if (sourceId !== "all") returnState.set("fromShow", sourceId)
    const trimmedQuery = query.trim()
    if (trimmedQuery) returnState.set("fromQuery", trimmedQuery.slice(0, 120))
    const search = returnState.toString()
    return `/${locale}/tasks/${task.id}/${slug}${search ? `?${search}` : ""}`
}

function sourceForTask(task: Task) {
    const catalogSource = task.source ?? findPodcastSource(task.author, task.video_url)
    if (catalogSource) return catalogSource

    const fallbackName = task.author?.trim() || "VibeDigest"
    const fallbackId = fallbackName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `digest-${task.id}`
    return {
        id: fallbackId,
        name: fallbackName,
        channelUrl: task.video_url,
        aliases: [],
        topics: [],
        featured: false,
    } satisfies PodcastSource
}

function metadataForTask(task: Task, locale: Locale, copy: PodcastCopy) {
    const values: string[] = []
    if (task.durationLabel) values.push(task.durationLabel)
    if (task.keyPointCount) values.push(`${task.keyPointCount} ${copy.keyPointUnit}`)
    if (values.length === 0) {
        values.push(new Intl.DateTimeFormat(localeDateTag[locale], { month: "short", day: "numeric" }).format(new Date(task.created_at)))
    }
    return values.join(" · ")
}

function buildLibraryHref(pathname: string, sourceId: string, query: string, page: number) {
    const params = new URLSearchParams()
    if (sourceId !== "all") params.set("show", sourceId)
    const trimmedQuery = query.trim()
    if (trimmedQuery) params.set("q", trimmedQuery.slice(0, 120))
    if (page > 1) params.set("page", String(page))
    const search = params.toString()
    return `${pathname}${search ? `?${search}` : ""}`
}

function SourceMark({ source, size = "large" }: { source: PodcastSource; size?: "compact" | "small" | "large" }) {
    const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
    const sizeClass = size === "large"
        ? "size-12 rounded-lg"
        : size === "small"
            ? "size-9 rounded-md"
            : "size-7 rounded-md"
    const sizes = size === "large" ? "48px" : size === "small" ? "36px" : "28px"

    return (
        <span
            data-source-mark={source.id}
            className={cn(
                "relative shrink-0 overflow-hidden border border-border bg-card",
                sizeClass
            )}
        >
            {source.avatarUrl && source.avatarUrl !== failedAvatarUrl ? (
                <Image
                    src={source.avatarUrl}
                    alt=""
                    fill
                    sizes={sizes}
                    className="object-cover"
                    onError={() => setFailedAvatarUrl(source.avatarUrl ?? null)}
                />
            ) : (
                <span className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground" aria-hidden="true">
                    {source.name.slice(0, 1).toUpperCase()}
                </span>
            )}
        </span>
    )
}

function EpisodeFeatureCard({
    task,
    locale,
    copy,
    sourceId,
    query,
    priority = false,
    role = "standard",
}: {
    task: Task
    locale: Locale
    copy: PodcastCopy
    sourceId: string
    query: string
    priority?: boolean
    role?: EpisodeCardRole
}) {
    const source = sourceForTask(task)
    if (!source) return null
    const title = task.video_title || task.video_url
    const href = taskDetailHref(task, locale, sourceId, query)

    return (
        <article
            data-card-role={role}
            className={episodeCardVariants({ role })}
        >
            <Link
                href={href}
                data-slot="episode-card-media"
                className={episodeMediaVariants({ role })}
                onClick={() => trackGrowthEvent("library_digest_open", {
                    locale,
                    source: source.id,
                    area: role,
                })}
            >
                {task.thumbnail_url ? (
                    <Image
                        src={task.thumbnail_url}
                        alt={title}
                        fill
                        referrerPolicy="no-referrer"
                        className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
                        sizes={role === "hero"
                            ? "(max-width: 1024px) 100vw, 58vw"
                            : role === "solo"
                                ? "(max-width: 1024px) 100vw, 62vw"
                                : role === "supporting"
                                    ? "(max-width: 1024px) 100vw, 42vw"
                                : "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 34vw"}
                        loading={priority ? "eager" : "lazy"}
                        fetchPriority={priority ? "high" : "auto"}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <SourceMark source={source} />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            </Link>

            <div data-slot="episode-card-content" className={episodeContentVariants({ role })}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-primary">
                    <SourceMark source={source} size="compact" />
                    <span className="truncate">{source.name}</span>
                </div>
                <Link href={href} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <h3
                        className={cn(
                            "tracking-[-0.02em] text-foreground transition-colors hover:text-primary",
                            role === "hero" || role === "solo"
                                ? "line-clamp-3 text-[1.65rem] font-semibold leading-[1.15] lg:text-[2rem]"
                                : role === "supporting"
                                    ? "line-clamp-2 text-base font-semibold leading-[1.3]"
                                    : "line-clamp-3 text-lg font-semibold leading-[1.3]"
                        )}
                    >
                        {title}
                    </h3>
                </Link>
                {task.takeaway && role !== "supporting" ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {task.takeaway}
                    </p>
                ) : null}
                {role !== "supporting" ? (
                    <p className="mt-3 border-t border-border pt-3 text-[11px] text-foreground-subtle">
                        {metadataForTask(task, locale, copy)}
                    </p>
                ) : null}
                <div data-slot="episode-card-footer" className={episodeFooterVariants({ role })}>
                    {role === "supporting" ? (
                        <span className="text-[11px] text-foreground-subtle">
                            {metadataForTask(task, locale, copy)}
                        </span>
                    ) : (
                        <Link
                            href={href}
                            onClick={() => trackGrowthEvent("library_digest_open", {
                                locale,
                                source: source.id,
                                area: `${role}_cta`,
                            })}
                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary-strong px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            {copy.read}
                        </Link>
                    )}
                    <a
                        href={task.video_url || source.channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        {copy.source}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                </div>
            </div>
        </article>
    )
}

function balancedFeatureItemClass(count: number) {
    if (count === 1) return "lg:col-span-12"
    if (count === 2) return "lg:col-span-6"
    if (count === 3) return "lg:col-span-4"
    return "lg:col-span-6"
}

function tailFeatureItemClass(count: number) {
    return count === 2 ? "lg:col-span-6" : "lg:col-span-4"
}

function PodcastFeatureGrid({
    tasks,
    locale,
    copy,
    sourceId,
    query,
}: {
    tasks: Task[]
    locale: Locale
    copy: PodcastCopy
    sourceId: string
    query: string
}) {
    if (tasks.length < 5) {
        const role: EpisodeCardRole = tasks.length === 1 ? "solo" : "standard"
        return (
            <div data-feature-layout="balanced" className="grid gap-px bg-slate-200 dark:bg-white/10 lg:grid-cols-12">
                {tasks.map((task, index) => (
                    <div
                        key={task.id}
                        className={cn(
                            "bg-[color:var(--background)] dark:bg-[#090b0b]",
                            balancedFeatureItemClass(tasks.length)
                        )}
                    >
                        <EpisodeFeatureCard
                            task={task}
                            locale={locale}
                            copy={copy}
                            priority={index === 0}
                            sourceId={sourceId}
                            query={query}
                            role={role}
                        />
                    </div>
                ))}
            </div>
        )
    }

    const [heroTask, ...restTasks] = tasks
    const supportingTasks = restTasks.slice(0, 2)
    const tailTasks = restTasks.slice(2)

    return (
        <div data-feature-layout="editorial" className="grid gap-px bg-slate-200 dark:bg-white/10 lg:grid-cols-12">
            <div className="bg-[color:var(--background)] dark:bg-[#090b0b] lg:col-span-7">
                <EpisodeFeatureCard
                    task={heroTask}
                    locale={locale}
                    copy={copy}
                    priority
                    sourceId={sourceId}
                    query={query}
                    role="hero"
                />
            </div>
            <div
                data-slot="supporting-stack"
                className="grid gap-px bg-slate-200 dark:bg-white/10 lg:col-span-5 lg:grid-rows-2"
            >
                {supportingTasks.map((task) => (
                    <div key={task.id} className="bg-[color:var(--background)] dark:bg-[#090b0b]">
                        <EpisodeFeatureCard
                            task={task}
                            locale={locale}
                            copy={copy}
                            sourceId={sourceId}
                            query={query}
                            role="supporting"
                        />
                    </div>
                ))}
            </div>
            {tailTasks.map((task) => (
                <div
                    key={task.id}
                    className={cn(
                        "bg-[color:var(--background)] dark:bg-[#090b0b]",
                        tailFeatureItemClass(tailTasks.length)
                    )}
                >
                    <EpisodeFeatureCard
                        task={task}
                        locale={locale}
                        copy={copy}
                        sourceId={sourceId}
                        query={query}
                        role="standard"
                    />
                </div>
            ))}
        </div>
    )
}

function CompactEpisodeRow({
    task,
    locale,
    sourceId,
    query,
}: {
    task: Task
    locale: Locale
    sourceId: string
    query: string
}) {
    const source = sourceForTask(task)
    if (!source) return null
    const href = taskDetailHref(task, locale, sourceId, query)
    const title = task.video_title || task.video_url

    return (
        <article className="border border-slate-200 bg-white/65 [content-visibility:auto] dark:border-white/10 dark:bg-white/[0.03]">
            <Link
                href={href}
                onClick={() => trackGrowthEvent("library_digest_open", {
                    locale,
                    source: source.id,
                    area: "compact",
                })}
                className="grid min-h-[7.75rem] grid-cols-[7.5rem_minmax(0,1fr)] gap-4 p-3 transition-colors hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-white/[0.035]"
            >
                <div className="relative overflow-hidden bg-slate-100 dark:bg-zinc-950">
                    {task.thumbnail_url ? (
                        <Image
                            src={task.thumbnail_url}
                            alt={title}
                            fill
                            referrerPolicy="no-referrer"
                            className="object-cover"
                            sizes="(max-width: 768px) 38vw, 9rem"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <SourceMark source={source} />
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <SourceMark source={source} size="compact" />
                        <span className="truncate">{source.name}</span>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-slate-950 dark:text-white">
                        {title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-zinc-500">
                        {task.takeaway || metadataForTask(task, locale, PODCAST_COPY[locale])}
                    </p>
                </div>
            </Link>
        </article>
    )
}

type CommunityTemplatesProps = {
    showHeader?: boolean
    initialTasks?: Task[]
    initialStatus?: "ready" | "unavailable"
    layout?: CommunityTemplatesLayout
    locale: Locale
    copy: CommunityCopy
    intro?: CommunityTemplatesIntro
    initialSource?: string
    initialQuery?: string
    sourceItems?: SourceShelfItem[]
    totalCount?: number
    hasMore?: boolean
    currentPage?: number
}

export function CommunityTemplates({
    showHeader = true,
    initialTasks = [],
    initialStatus = "ready",
    layout = "gallery",
    locale,
    copy,
    intro,
    initialSource = "all",
    initialQuery = "",
    sourceItems = [],
    totalCount = 0,
    hasMore = false,
    currentPage = 1,
}: CommunityTemplatesProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [showAllSources, setShowAllSources] = useState(false)
    const normalizedInitialQuery = initialQuery.slice(0, 120)
    const [queryInput, setQueryInput] = useState({
        base: normalizedInitialQuery,
        draft: normalizedInitialQuery,
    })
    const queryDraft = queryInput.base === normalizedInitialQuery
        ? queryInput.draft
        : normalizedInitialQuery
    const deferredQuery = useDeferredValue(queryDraft)
    const podcastCopy = PODCAST_COPY[locale]
    const selectedSource = initialSource
    const query = initialQuery.slice(0, 120)
    const featuredSources = sourceItems.slice(0, 6)
    const selectedSourceNeedsExpansion = selectedSource !== "all" && !featuredSources.some((item) => item.source.id === selectedSource)
    const sourcesExpanded = showAllSources || selectedSourceNeedsExpansion
    const visibleSources = sourcesExpanded ? sourceItems : featuredSources
    const canToggleAllSources = sourceItems.length > featuredSources.length
    const featuredTasks = initialTasks.slice(0, FEATURED_COUNT)
    const feedTasks = initialTasks.slice(FEATURED_COUNT)

    useEffect(() => {
        if (layout === "gallery") trackGrowthEvent("library_view", { locale })
    }, [layout, locale])

    useEffect(() => {
        const trimmedDeferred = deferredQuery.trim().slice(0, 120)
        const trimmedInitial = initialQuery.trim().slice(0, 120)
        if (trimmedDeferred === trimmedInitial || !pathname) return
        const nextHref = buildLibraryHref(pathname, selectedSource, trimmedDeferred, 1)
        const timer = window.setTimeout(() => {
            router.replace(nextHref, { scroll: false })
        }, 220)
        return () => window.clearTimeout(timer)
    }, [deferredQuery, initialQuery, pathname, router, selectedSource])

    if (initialStatus === "unavailable") {
        return <p className="py-10 text-sm text-slate-500 dark:text-zinc-400" role="status">{copy.unavailable}</p>
    }

    if (layout === "landingPreview") {
        if (featuredTasks.length === 0) return null
        return (
            <div className="grid gap-px bg-border-strong sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 [&>div]:!bg-card [&_[data-card-role]]:!border-0 [&_[data-card-role]]:!bg-card">
                {featuredTasks.slice(0, 4).map((task, index) => (
                    <div
                        key={task.id}
                        className={cn("bg-card", index >= 2 && "hidden sm:block")}
                    >
                        <EpisodeFeatureCard
                            task={task}
                            locale={locale}
                            copy={podcastCopy}
                            priority={index === 0}
                            sourceId={selectedSource}
                            query={query}
                            role="standard"
                        />
                    </div>
                ))}
            </div>
        )
    }

    const clearHref = pathname ? buildLibraryHref(pathname, "all", "", 1) : "#"
    const loadMoreHref = pathname ? buildLibraryHref(pathname, selectedSource, query, currentPage + 1) : "#"

    return (
        <div className="space-y-8">
            {intro ? (
                <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)] lg:items-end">
                    <div className="max-w-3xl">
                        <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{intro.eyebrow}</p>
                        <h1 className="font-display text-4xl font-bold tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white">{intro.title}</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-zinc-400">{intro.description}</p>
                    </div>
                    <section id="podcast-search" aria-label={podcastCopy.search} className="scroll-mt-24">
                        <div className="relative block w-full">
                            <span className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-zinc-300">
                                <label htmlFor="podcast-library-search">{podcastCopy.search}</label>
                                <span className="text-xs text-slate-500 dark:text-zinc-500">
                                    {totalCount} {podcastCopy.resultCount}
                                </span>
                            </span>
                            <span className="relative block">
                                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
                                <input
                                    id="podcast-library-search"
                                    type="search"
                                    value={queryDraft}
                                    maxLength={120}
                                    onChange={(event) => setQueryInput({
                                        base: normalizedInitialQuery,
                                        draft: event.target.value,
                                    })}
                                    placeholder={podcastCopy.searchPlaceholder}
                                    className="h-12 w-full rounded-xl border border-slate-300 bg-white/80 pl-11 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500"
                                />
                            </span>
                        </div>
                    </section>
                </header>
            ) : null}

            {showHeader ? (
                <div>
                    <h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">{copy.title}</h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">{copy.hint}</p>
                </div>
            ) : null}

            <section id="podcast-sources" aria-labelledby="podcast-source-heading" className="scroll-mt-24 border-b border-slate-200 pb-6 dark:border-white/10">
                <div className="mb-3 flex items-end justify-between gap-4">
                    <h2 id="podcast-source-heading" className="text-base font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.sourceShelf}</h2>
                </div>
                <div className={cn("flex items-center gap-x-4 gap-y-4", sourcesExpanded ? "flex-wrap" : "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0")}>
                    <Link
                        href={pathname ? buildLibraryHref(pathname, "all", query, 1) : "#"}
                        scroll={false}
                        onClick={() => trackGrowthEvent("library_filter_source", { locale, source: "all" })}
                        aria-current={selectedSource === "all" ? "page" : undefined}
                        className={cn(
                            "inline-flex min-h-11 shrink-0 items-center rounded-full border px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                            selectedSource === "all"
                                ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-white"
                                : "border-slate-200 text-slate-600 hover:border-emerald-500/50 dark:border-white/10 dark:text-zinc-400"
                        )}
                    >
                        {podcastCopy.all}
                    </Link>
                    {visibleSources.map((item) => (
                        <Link
                            key={item.source.id}
                            href={pathname ? buildLibraryHref(pathname, item.source.id, query, 1) : "#"}
                            scroll={false}
                            onClick={() => trackGrowthEvent("library_filter_source", { locale, source: item.source.id })}
                            aria-current={selectedSource === item.source.id ? "page" : undefined}
                            className={cn(
                                "flex min-h-12 shrink-0 items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                                selectedSource === item.source.id
                                    ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-white"
                                    : "hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                            )}
                        >
                            <SourceMark source={item.source} size="small" />
                            <span>
                                <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">{item.source.name}</span>
                                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-zinc-500">{item.count} {podcastCopy.episodeUnit}</span>
                            </span>
                        </Link>
                    ))}
                    {canToggleAllSources && !selectedSourceNeedsExpansion ? (
                        <button
                            type="button"
                            onClick={() => setShowAllSources((value) => !value)}
                            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:ml-auto dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                            {sourcesExpanded ? podcastCopy.showLess : podcastCopy.showAll}
                            <ChevronDown className={cn("size-4 transition-transform", sourcesExpanded && "rotate-180")} aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            </section>

            {featuredTasks.length > 0 ? (
                <section id="podcast-curated" aria-labelledby="podcast-curated-heading" className="scroll-mt-24 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <h2 id="podcast-curated-heading" className="text-lg font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.curated}</h2>
                        {(selectedSource !== "all" || query) ? (
                            <Link
                                href={clearHref}
                                scroll={false}
                                className="text-sm font-medium text-slate-500 transition-colors hover:text-emerald-700 dark:text-zinc-500 dark:hover:text-emerald-400"
                            >
                                {podcastCopy.clearFilters}
                            </Link>
                        ) : null}
                    </div>

                    <PodcastFeatureGrid
                        tasks={featuredTasks}
                        locale={locale}
                        copy={podcastCopy}
                        sourceId={selectedSource}
                        query={query}
                    />
                </section>
            ) : (
                <section className="border border-dashed border-slate-300 px-5 py-10 text-center dark:border-white/15">
                    <p className="text-sm text-slate-500 dark:text-zinc-500" role="status">{podcastCopy.empty}</p>
                    {(selectedSource !== "all" || query) ? (
                        <Link
                            href={clearHref}
                            scroll={false}
                            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:text-zinc-300 dark:hover:border-emerald-400 dark:hover:text-emerald-400"
                        >
                            {podcastCopy.clearFilters}
                        </Link>
                    ) : null}
                </section>
            )}

            {feedTasks.length > 0 ? (
                <section id="podcast-feed" aria-labelledby="podcast-feed-heading" className="scroll-mt-24 space-y-4">
                    <h2 id="podcast-feed-heading" className="text-lg font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.recent}</h2>
                    <div className="grid gap-px bg-slate-200 dark:bg-white/10 lg:grid-cols-2">
                        {feedTasks.map((task) => (
                            <div key={task.id} className="bg-[color:var(--background)] dark:bg-[#090b0b]">
                                <CompactEpisodeRow task={task} locale={locale} sourceId={selectedSource} query={query} />
                            </div>
                        ))}
                    </div>
                    {hasMore ? (
                        <div className="flex justify-center pt-2">
                            <Link
                                href={loadMoreHref}
                                scroll={false}
                                onClick={() => trackGrowthEvent("library_load_more", {
                                    locale,
                                    page: currentPage + 1,
                                    source: selectedSource,
                                })}
                                className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500/60 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:text-zinc-300 dark:hover:border-emerald-400/60 dark:hover:text-emerald-400"
                            >
                                {podcastCopy.loadMore}
                            </Link>
                        </div>
                    ) : null}
                </section>
            ) : null}
        </div>
    )
}
