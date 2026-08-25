"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ChevronDown, ExternalLink, Search } from "lucide-react"
import type { Locale } from "@/lib/i18n"
import { findPodcastSource, PODCAST_SOURCES, type PodcastSource } from "@/lib/podcast-sources"
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
    author?: string
    author_image_url?: string
    task_outputs?: TaskOutput[]
    takeaway?: string
    keyPointCount?: number
    durationLabel?: string
    source?: PodcastSource
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
}

const PODCAST_COPY: Record<Locale, PodcastCopy> = {
    en: {
        sourceShelf: "Browse by show", all: "All", showAll: "Browse all shows", showLess: "Show less",
        curated: "Ready to read", recent: "More organized episodes", read: "View digest",
        source: "Original episode", search: "Search content", searchPlaceholder: "Search by episode, show, or topic",
        empty: "No finished digests match this filter yet.", clearFilters: "Clear filters",
        loadMore: "Load more",
        episodeUnit: "digests", keyPointUnit: "key points",
    },
    zh: {
        sourceShelf: "按节目浏览", all: "全部", showAll: "浏览全部节目", showLess: "收起节目",
        curated: "可以直接阅读", recent: "更多整理内容", read: "查看整理", source: "原节目",
        search: "搜索内容", searchPlaceholder: "输入节目、嘉宾或主题",
        empty: "没有符合当前筛选的整理内容。", clearFilters: "清除筛选",
        loadMore: "加载更多",
        episodeUnit: "期整理", keyPointUnit: "个关键观点",
    },
    ja: {
        sourceShelf: "番組から探す", all: "すべて", showAll: "すべての番組を見る", showLess: "折りたたむ",
        curated: "すぐに読める整理内容", recent: "その他の整理内容", read: "整理内容を見る", source: "元のエピソード",
        search: "内容を検索", searchPlaceholder: "エピソード、番組、トピックを検索",
        empty: "現在の条件に一致する整理内容はありません。", clearFilters: "絞り込みを解除",
        loadMore: "さらに読み込む",
        episodeUnit: "件の整理", keyPointUnit: "の要点",
    },
}

const localeDateTag: Record<Locale, string> = { en: "en-US", zh: "zh-CN", ja: "ja-JP" }

function taskDetailHref(task: Task, locale: Locale, sourceId = "all", query = "") {
    const slug = encodeURIComponent((task.video_title || "podcast").trim().replace(/\s+/g, "-"))
    const returnState = new URLSearchParams()
    if (sourceId !== "all") returnState.set("fromShow", sourceId)
    const trimmedQuery = query.trim()
    if (trimmedQuery) returnState.set("fromQuery", trimmedQuery.slice(0, 120))
    const search = returnState.toString()
    return `/${locale}/tasks/${task.id}/${slug}${search ? `?${search}` : ""}`
}

function sourceForTask(task: Task) {
    return task.source ?? findPodcastSource(task.author, task.video_url)
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

function SourceMark({ source, size = "large" }: { source: PodcastSource; size?: "compact" | "small" | "large" }) {
    const sizeClass = size === "large"
        ? "size-12 rounded-lg"
        : size === "small"
            ? "size-9 rounded-md"
            : "size-7 rounded-md"
    const imageSize = size === "large" ? "48px" : size === "small" ? "36px" : "28px"

    return (
        <span className={cn(
            "relative shrink-0 overflow-hidden border border-slate-200 bg-white dark:border-white/10 dark:bg-zinc-900",
            sizeClass
        )}>
            {source.avatarUrl ? (
                <Image src={source.avatarUrl} alt="" fill sizes={imageSize} className="object-cover" />
            ) : (
                <span className="flex size-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-zinc-300" aria-hidden="true">
                    {source.name.slice(0, 1).toUpperCase()}
                </span>
            )}
        </span>
    )
}

function EpisodeCard({ task, locale, copy, priority = false, sourceId = "all", query = "" }: { task: Task; locale: Locale; copy: PodcastCopy; priority?: boolean; sourceId?: string; query?: string }) {
    const source = sourceForTask(task)
    if (!source) return null
    const title = task.video_title || task.video_url

    return (
        <article className="group flex flex-col border border-slate-200 bg-white/70 transition-colors hover:border-emerald-500/50 dark:border-white/15 dark:bg-black/20 dark:hover:border-emerald-400/50">
            <Link href={taskDetailHref(task, locale, sourceId, query)} className="relative block aspect-video overflow-hidden bg-slate-100 dark:bg-zinc-950">
                {task.thumbnail_url ? (
                    <Image
                        src={task.thumbnail_url} alt={title} fill
                        className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.025]"
                        referrerPolicy="no-referrer"
                        unoptimized
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1119px) 33vw, 25vw"
                        loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center"><SourceMark source={source} /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-70" />
            </Link>

            <div className="flex flex-1 flex-col px-4 pb-3 pt-3">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <SourceMark source={source} size="compact" />
                    <span className="truncate">{source.name}</span>
                </div>
                <Link href={taskDetailHref(task, locale, sourceId, query)} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    <h3 className="line-clamp-2 text-base font-semibold leading-[1.4] tracking-[-0.02em] text-slate-950 transition-colors hover:text-emerald-700 dark:text-white dark:hover:text-emerald-400">{title}</h3>
                </Link>
                <p className="mt-2 border-b border-slate-200 pb-2.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-zinc-500">
                    {metadataForTask(task, locale, copy)}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                    <Link
                        href={taskDetailHref(task, locale, sourceId, query)}
                        className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-zinc-950"
                    >{copy.read}</Link>
                    <a
                        href={task.video_url || source.channelUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-slate-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:text-emerald-400"
                    >
                        {copy.source}<ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                </div>
            </div>
        </article>
    )
}

function RecentEpisodeRow({ task, locale, sourceId = "all", query = "" }: { task: Task; locale: Locale; sourceId?: string; query?: string }) {
    const source = sourceForTask(task)
    if (!source) return null
    return (
        <Link
            href={taskDetailHref(task, locale, sourceId, query)}
            className="group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-200 px-2 py-3 transition-colors hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:hover:bg-white/[0.035]"
        >
            <SourceMark source={source} size="small" />
            <div className="min-w-0 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.6fr)] md:items-center md:gap-6">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{task.video_title || task.video_url}</p>
                <p className="mt-1 truncate text-xs text-emerald-700 md:mt-0 dark:text-emerald-400">{source.name}</p>
            </div>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:text-zinc-600 dark:group-hover:text-emerald-400" aria-hidden="true" />
        </Link>
    )
}

function episodeGridClass(taskCount: number) {
    return cn(
        "grid w-full grid-cols-1 justify-start gap-px",
        taskCount === 1 && "max-w-[21rem]",
        taskCount === 2 && "sm:max-w-[42rem] sm:grid-cols-2",
        taskCount === 3 && "sm:max-w-[42rem] sm:grid-cols-2 lg:max-w-[63rem] lg:grid-cols-3",
        taskCount >= 4 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    )
}

type CommunityTemplatesProps = {
    limit?: number
    showHeader?: boolean
    initialTasks?: Task[]
    initialStatus?: "ready" | "unavailable"
    layout?: CommunityTemplatesLayout
    locale: Locale
    copy: CommunityCopy
    intro?: CommunityTemplatesIntro
    initialSource?: string
    initialQuery?: string
}

export function CommunityTemplates({ showHeader = true, initialTasks = [], initialStatus = "ready", layout = "gallery", locale, copy, intro, initialSource = "all", initialQuery = "" }: CommunityTemplatesProps) {
    const tasks = initialTasks
    const knownInitialSourceIds = useMemo(() => new Set([
        ...PODCAST_SOURCES.map((source) => source.id),
        ...initialTasks.map((task) => task.source?.id).filter((id): id is string => Boolean(id)),
    ]), [initialTasks])
    const normalizedInitialSource = initialSource === "all" || knownInitialSourceIds.has(initialSource)
        ? initialSource
        : "all"
    const [selectedSource, setSelectedSource] = useState(normalizedInitialSource)
    const [showAllSources, setShowAllSources] = useState(false)
    const [visibleTaskCount, setVisibleTaskCount] = useState(10)
    const [query, setQuery] = useState(initialQuery.slice(0, 120))
    const podcastCopy = PODCAST_COPY[locale]

    const updateLibraryUrl = (sourceId: string, nextQuery: string, mode: "push" | "replace") => {
        if (typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        if (sourceId === "all") params.delete("show")
        else params.set("show", sourceId)
        const trimmedQuery = nextQuery.trim()
        if (trimmedQuery) params.set("q", trimmedQuery)
        else params.delete("q")
        const search = params.toString()
        const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
        if (mode === "push") window.history.pushState(null, "", nextUrl)
        else window.history.replaceState(null, "", nextUrl)
    }

    const selectSource = (sourceId: string) => {
        if (sourceId === selectedSource) return
        setSelectedSource(sourceId)
        setVisibleTaskCount(10)
        updateLibraryUrl(sourceId, query, "push")
    }

    const clearFilters = () => {
        setSelectedSource("all")
        setQuery("")
        setVisibleTaskCount(10)
        updateLibraryUrl("all", "", "replace")
    }

    useEffect(() => {
        const syncFromHistory = () => {
            const params = new URLSearchParams(window.location.search)
            const source = params.get("show") || "all"
            setSelectedSource(source === "all" || knownInitialSourceIds.has(source) ? source : "all")
            setQuery((params.get("q") || "").slice(0, 120))
            setVisibleTaskCount(10)
        }
        window.addEventListener("popstate", syncFromHistory)
        return () => window.removeEventListener("popstate", syncFromHistory)
    }, [knownInitialSourceIds])

    const podcastTasks = useMemo(() => tasks.filter((task) => Boolean(sourceForTask(task))), [tasks])
    const sourceCounts = useMemo(() => {
        const counts = new Map<string, number>()
        podcastTasks.forEach((task) => {
            const source = sourceForTask(task)
            if (source) counts.set(source.id, (counts.get(source.id) ?? 0) + 1)
        })
        return counts
    }, [podcastTasks])
    const filteredTasks = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        return podcastTasks.filter((task) => {
            const source = sourceForTask(task)
            if (!source || (selectedSource !== "all" && source.id !== selectedSource)) return false
            if (!normalizedQuery) return true
            return [task.video_title, task.author, task.takeaway, source.name]
                .filter(Boolean).some((value) => value?.toLowerCase().includes(normalizedQuery))
        })
    }, [podcastTasks, query, selectedSource])

    const availableSources = useMemo(() => {
        const sources = new Map<string, PodcastSource>()
        podcastTasks.forEach((task) => {
            const source = sourceForTask(task)
            if (source) sources.set(source.id, source)
        })
        return [...sources.values()].sort((left, right) =>
            (left.order ?? 1000) - (right.order ?? 1000) || left.name.localeCompare(right.name)
        )
    }, [podcastTasks])
    const featuredSources = useMemo(() => [
        ...availableSources.filter((source) => source.featured),
        ...availableSources.filter((source) => !source.featured),
    ].slice(0, 5), [availableSources])

    if (initialStatus === "unavailable") return <p className="py-10 text-sm text-slate-500 dark:text-zinc-400" role="status">{copy.unavailable}</p>

    const selectedSourceNeedsExpansion = selectedSource !== "all" && !featuredSources.some((source) => source.id === selectedSource)
    const sourcesExpanded = showAllSources || selectedSourceNeedsExpansion
    const visibleSources = sourcesExpanded ? availableSources : featuredSources
    const canToggleAllSources = availableSources.length > featuredSources.length
    const cardTasks = filteredTasks.slice(0, 4)
    const recentTasks = filteredTasks.slice(4, visibleTaskCount)

    if (layout === "landingPreview") {
        if (cardTasks.length === 0) return null
        return (
            <div className={episodeGridClass(cardTasks.length)}>
                {cardTasks.map((task, index) => <EpisodeCard key={task.id} task={task} locale={locale} copy={podcastCopy} priority={index === 0} sourceId={selectedSource} query={query} />)}
            </div>
        )
    }

    const searchField = (
        <section id="podcast-search" aria-label={podcastCopy.search} className="w-full scroll-mt-24">
            <label className="relative block w-full">
                <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-zinc-300">{podcastCopy.search}</span>
                <span className="relative block">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        maxLength={120}
                        onChange={(event) => {
                            const nextQuery = event.target.value
                            setQuery(nextQuery)
                            setVisibleTaskCount(10)
                            updateLibraryUrl(selectedSource, nextQuery, "replace")
                        }}
                        placeholder={podcastCopy.searchPlaceholder}
                        className="h-12 w-full rounded-xl border border-slate-300 bg-white/80 pl-11 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                </span>
            </label>
        </section>
    )

    return (
        <div className="space-y-8">
            {intro && (
                <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,36rem)] lg:items-end lg:gap-12">
                    <div className="max-w-3xl">
                        <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{intro.eyebrow}</p>
                        <h1 className="font-display text-4xl font-bold tracking-[-0.035em] text-slate-950 sm:text-5xl dark:text-white">{intro.title}</h1>
                        <p className="mt-3 text-base text-slate-600 dark:text-zinc-400">{intro.description}</p>
                    </div>
                    <div className="w-full lg:justify-self-end lg:pb-1">{searchField}</div>
                </header>
            )}

            {showHeader && <div><h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">{copy.title}</h2><p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">{copy.hint}</p></div>}

            <section id="podcast-sources" aria-labelledby="podcast-source-heading" className="scroll-mt-24 border-b border-slate-200 pb-6 dark:border-white/10">
                <h2 id="podcast-source-heading" className="mb-3 text-base font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.sourceShelf}</h2>
                <div className={cn("flex items-center gap-x-5 gap-y-4", sourcesExpanded ? "flex-wrap" : "overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0")}>
                    <button type="button" onClick={() => selectSource("all")} aria-pressed={selectedSource === "all"} className={cn("min-h-11 shrink-0 rounded-full border px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", selectedSource === "all" ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-white" : "border-slate-200 text-slate-600 hover:border-emerald-500/50 dark:border-white/10 dark:text-zinc-400")}>{podcastCopy.all}</button>
                    {visibleSources.map((source) => {
                        const count = sourceCounts.get(source.id) ?? 0
                        return (
                            <button key={source.id} type="button" onClick={() => selectSource(source.id)} aria-pressed={selectedSource === source.id} className={cn("flex min-h-12 shrink-0 items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500", selectedSource === source.id ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-white" : "hover:bg-slate-100 dark:hover:bg-white/[0.04]") }>
                                <SourceMark source={source} size="small" />
                                <span><span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">{source.name}</span><span className="mt-0.5 block text-[11px] text-slate-500 dark:text-zinc-500">{count} {podcastCopy.episodeUnit}</span></span>
                            </button>
                        )
                    })}
                    {canToggleAllSources && !selectedSourceNeedsExpansion && (
                        <button type="button" onClick={() => setShowAllSources((value) => !value)} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:ml-auto dark:text-emerald-400 dark:hover:text-emerald-300">
                            {sourcesExpanded ? podcastCopy.showLess : podcastCopy.showAll}<ChevronDown className={cn("size-4 transition-transform", sourcesExpanded && "rotate-180")} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </section>

            {!intro && <div className="max-w-xl">{searchField}</div>}

            <section id="podcast-curated" aria-labelledby="podcast-curated-heading" className="scroll-mt-24">
                <h2 id="podcast-curated-heading" className="mb-4 text-lg font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.curated}</h2>
                {cardTasks.length > 0 ? (
                    <div className={episodeGridClass(cardTasks.length)}>
                        {cardTasks.map((task, index) => <EpisodeCard key={task.id} task={task} locale={locale} copy={podcastCopy} priority={index === 0} sourceId={selectedSource} query={query} />)}
                    </div>
                ) : (
                    <div className="border border-dashed border-slate-300 px-5 py-10 text-center dark:border-white/15">
                        <p className="text-sm text-slate-500 dark:text-zinc-500" role="status">{podcastCopy.empty}</p>
                        {(selectedSource !== "all" || query) && (
                            <button type="button" onClick={clearFilters} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:text-zinc-300 dark:hover:border-emerald-400 dark:hover:text-emerald-400">
                                {podcastCopy.clearFilters}
                            </button>
                        )}
                    </div>
                )}
            </section>

            {recentTasks.length > 0 && (
                <section id="podcast-topics" aria-labelledby="podcast-recent-heading" className="scroll-mt-24">
                    <h2 id="podcast-recent-heading" className="mb-3 text-lg font-semibold text-slate-950 dark:text-zinc-100">{podcastCopy.recent}</h2>
                    <div className="border border-slate-200 dark:border-white/10">{recentTasks.map((task) => <RecentEpisodeRow key={task.id} task={task} locale={locale} sourceId={selectedSource} query={query} />)}</div>
                    {filteredTasks.length > visibleTaskCount && (
                        <button type="button" onClick={() => setVisibleTaskCount((count) => count + 12)} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500/60 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:text-zinc-300 dark:hover:border-emerald-400/60 dark:hover:text-emerald-400">
                            {podcastCopy.loadMore}
                        </button>
                    )}
                </section>
            )}
        </div>
    )
}
