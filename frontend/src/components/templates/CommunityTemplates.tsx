"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cva } from "class-variance-authority"
import { ExternalLink, Search } from "lucide-react"
import { getLocaleDisplayName, type Locale } from "@/lib/i18n"
import { trackGrowthEvent } from "@/lib/growth-events"
import { findPodcastSource, resolvePodcastSourceId, type PodcastSource } from "@/lib/podcast-sources"
import { buildTaskSlug } from "@/lib/task-path"
import { buildLibraryHref, libraryEpisodeAnchor, parseLibraryReturnHref } from "@/lib/library-navigation"
import { cn } from "@/lib/utils"
import { TopicHubLinks } from "./TopicHubLinks"

export type TaskOutput = {
    kind: string
    content: unknown
    status?: string | null
    locale?: string | null
    created_at?: string | null
    updated_at?: string | null
    provenance?: unknown
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
    takeawayLocale?: Locale | null
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
    recent: string
    read: string
    source: string
    search: string
    searchPlaceholder: string
    empty: string
    clearFilters: string
    loadMore: string
    keyPointUnit: string
    resultCount: string
    languageAvailable: (language: string) => string
}

const PODCAST_COPY: Record<Locale, PodcastCopy> = {
    en: {
        sourceShelf: "Browse by show",
        all: "All",
        recent: "More organized episodes",
        read: "View digest",
        source: "Original episode",
        search: "Search content",
        searchPlaceholder: "Search by episode, show, guest, or topic",
        empty: "No finished digests match this filter yet.",
        clearFilters: "Clear filters",
        loadMore: "Load more",
        keyPointUnit: "key points",
        resultCount: "digests ready",
        languageAvailable: (language) => `Digest available in ${language}.`,
    },
    zh: {
        sourceShelf: "按节目浏览",
        all: "全部",
        recent: "更多整理内容",
        read: "查看整理",
        source: "原节目",
        search: "搜索内容",
        searchPlaceholder: "输入节目、嘉宾或主题",
        empty: "没有符合当前筛选的整理内容。",
        clearFilters: "清除筛选",
        loadMore: "加载更多",
        keyPointUnit: "个关键观点",
        resultCount: "条已整理内容",
        languageAvailable: (language) => `该整理当前提供${language}版本。`,
    },
}

const localeDateTag: Record<Locale, string> = { en: "en-US", zh: "zh-CN" }
const FEATURED_COUNT = 6

type EpisodeCardRole = "hero" | "supporting" | "solo" | "standard"

const episodeCardVariants = cva(
    "group relative h-full overflow-hidden border border-border bg-card/80 transition-colors hover:border-primary-muted/60",
    {
        variants: {
            role: {
                hero: "flex flex-col sm:min-h-[25rem] lg:grid lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]",
                supporting: "grid grid-rows-[minmax(0,1fr)_auto] sm:min-h-[18rem] lg:min-h-0",
                solo: "flex min-h-[20rem] flex-col lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]",
                standard: "flex flex-col sm:min-h-[18rem]",
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
                hero: "aspect-[16/9] sm:aspect-[1.38/1] lg:aspect-[1.55/1]",
                supporting: "aspect-[16/9] sm:aspect-[16/10] lg:aspect-[5/2] lg:min-h-0",
                solo: "aspect-video lg:aspect-auto lg:min-h-[22rem]",
                standard: "aspect-[16/9] sm:aspect-[16/10]",
            },
        },
        defaultVariants: {
            role: "standard",
        },
    }
)

const episodeContentVariants = cva("flex flex-col px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3", {
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

function taskDetailHref(task: Task, locale: Locale, returnHref?: string) {
    const slug = buildTaskSlug(task.video_title || "podcast")
    const returnState = new URLSearchParams()
    const safeReturn = parseLibraryReturnHref(returnHref)
    if (safeReturn) returnState.set("from", `${safeReturn}#${libraryEpisodeAnchor(task.id)}`)
    const search = returnState.toString()
    return `/${locale}/tasks/${task.id}/${slug}${search ? `?${search}` : ""}`
}

function taskDigestLocale(task: Task, routeLocale: Locale) {
    return task.takeawayLocale ?? routeLocale
}

function mismatchNotice(task: Task, routeLocale: Locale, copy: PodcastCopy) {
    if (!task.takeawayLocale || task.takeawayLocale === routeLocale) return null
    return copy.languageAvailable(getLocaleDisplayName(task.takeawayLocale, routeLocale))
}

function sourceForTask(task: Task) {
    const catalogSource = task.source ?? findPodcastSource(task.author, task.video_url)
    if (catalogSource) return catalogSource

    const fallbackName = task.author?.trim() || "VibeDigest"
    return {
        id: resolvePodcastSourceId({
            author: task.author,
            videoUrl: task.video_url,
        }),
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
    returnHref,
    onNavigate,
    priority = false,
    role = "standard",
    sizes,
}: {
    task: Task
    locale: Locale
    copy: PodcastCopy
    returnHref?: string
    onNavigate?: () => void
    priority?: boolean
    role?: EpisodeCardRole
    sizes?: string
}) {
    const source = sourceForTask(task)
    if (!source) return null
    const title = task.video_title || task.video_url
    const href = taskDetailHref(task, taskDigestLocale(task, locale), returnHref)
    const digestNotice = mismatchNotice(task, locale, copy)

    return (
        <article
            id={libraryEpisodeAnchor(task.id)}
            data-card-role={role}
            className={episodeCardVariants({ role })}
        >
            <div
                data-slot="episode-card-media"
                className={episodeMediaVariants({ role })}
            >
                {task.thumbnail_url ? (
                    <Image
                        src={task.thumbnail_url}
                        alt=""
                        fill
                        referrerPolicy="no-referrer"
                        className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
                        sizes={sizes ?? (role === "hero"
                            ? "(max-width: 1024px) 100vw, 58vw"
                            : role === "solo"
                                ? "(max-width: 1024px) 100vw, 62vw"
                                : role === "supporting"
                                    ? "(max-width: 1024px) 100vw, 42vw"
                                : "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 34vw")}
                        loading={priority ? "eager" : "lazy"}
                        fetchPriority={priority ? "high" : "auto"}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <SourceMark source={source} />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            </div>

            <div data-slot="episode-card-content" className={episodeContentVariants({ role })}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-primary">
                    <SourceMark source={source} size="compact" />
                    <span className="truncate">{source.name}</span>
                </div>
                <Link
                    href={href}
                    onNavigate={onNavigate}
                    aria-label={`${copy.read}: ${title}`}
                    onClick={() => trackGrowthEvent("library_digest_open", {
                        locale,
                        source: source.id,
                        area: role,
                    })}
                    className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-primary"
                >
                    <h3
                        className={cn(
                            "tracking-[-0.02em] text-foreground transition-colors hover:text-primary",
                            role === "hero" || role === "solo"
                                ? "line-clamp-3 text-[1.375rem] font-semibold leading-[1.15] sm:text-[1.65rem] lg:text-[2rem]"
                                : role === "supporting"
                                    ? "line-clamp-2 text-[0.9375rem] font-semibold leading-[1.3] sm:text-base"
                                    : "line-clamp-3 text-base font-semibold leading-[1.3] sm:text-lg"
                        )}
                    >
                        {title}
                    </h3>
                </Link>
                {task.takeaway && task.takeawayLocale === locale && role !== "supporting" ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {task.takeaway}
                    </p>
                ) : digestNotice && role !== "supporting" ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {digestNotice}
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
                        <span
                            aria-hidden="true"
                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary-strong px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            {copy.read}
                        </span>
                    )}
                    <a
                        href={task.video_url || source.channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${copy.source}: ${title}`}
                        className="relative z-10 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
    returnHref,
    onNavigate,
}: {
    tasks: Task[]
    locale: Locale
    copy: PodcastCopy
    returnHref?: string
    onNavigate?: () => void
}) {
    if (tasks.length < 5) {
        const role: EpisodeCardRole = tasks.length === 1 ? "solo" : "standard"
        return (
            <div data-feature-layout="balanced" className="grid gap-px bg-border lg:grid-cols-12">
                {tasks.map((task, index) => (
                    <div
                        key={task.id}
                        className={cn(
                            "bg-background",
                            balancedFeatureItemClass(tasks.length)
                        )}
                    >
                        <EpisodeFeatureCard
                            task={task}
                            locale={locale}
                            copy={copy}
                            priority={index === 0}
                            returnHref={returnHref}
                            onNavigate={onNavigate}
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
        <div data-feature-layout="editorial" className="grid gap-px bg-border lg:grid-cols-12">
            <div className="bg-background lg:col-span-7">
                <EpisodeFeatureCard
                    task={heroTask}
                    locale={locale}
                    copy={copy}
                    priority
                    returnHref={returnHref}
                    onNavigate={onNavigate}
                    role="hero"
                />
            </div>
            <div
                data-slot="supporting-stack"
                className="grid gap-px bg-border lg:col-span-5 lg:grid-rows-2"
            >
                {supportingTasks.map((task) => (
                    <div key={task.id} className="bg-background">
                        <EpisodeFeatureCard
                            task={task}
                            locale={locale}
                            copy={copy}
                            returnHref={returnHref}
                            onNavigate={onNavigate}
                            role="supporting"
                        />
                    </div>
                ))}
            </div>
            {tailTasks.map((task) => (
                <div
                    key={task.id}
                    className={cn(
                        "bg-background",
                        tailFeatureItemClass(tailTasks.length)
                    )}
                >
                    <EpisodeFeatureCard
                        task={task}
                        locale={locale}
                        copy={copy}
                        returnHref={returnHref}
                        onNavigate={onNavigate}
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
    returnHref,
    onNavigate,
}: {
    task: Task
    locale: Locale
    returnHref?: string
    onNavigate?: () => void
}) {
    const source = sourceForTask(task)
    if (!source) return null
    const href = taskDetailHref(task, taskDigestLocale(task, locale), returnHref)
    const title = task.video_title || task.video_url
    const digestNotice = mismatchNotice(task, locale, PODCAST_COPY[locale])
    const localizedTakeaway = task.takeawayLocale === locale ? task.takeaway : null

    return (
        <article id={libraryEpisodeAnchor(task.id)} className="w-full min-w-0 border border-border bg-card/80 [content-visibility:auto]">
            <Link
                href={href}
                onNavigate={onNavigate}
                onClick={() => trackGrowthEvent("library_digest_open", {
                    locale,
                    source: source.id,
                    area: "compact",
                })}
                className="grid min-h-[7.75rem] grid-cols-[7.5rem_minmax(0,1fr)] gap-4 p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/[0.035]"
            >
                <div className="relative overflow-hidden bg-muted">
                    {task.thumbnail_url ? (
                        <Image
                            src={task.thumbnail_url}
                            alt={title}
                            fill
                            referrerPolicy="no-referrer"
                            className="object-cover"
                            sizes="7.5rem"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <SourceMark source={source} />
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-primary">
                        <SourceMark source={source} size="compact" />
                        <span className="truncate">{source.name}</span>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                        {title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {digestNotice || localizedTakeaway || metadataForTask(task, locale, PODCAST_COPY[locale])}
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
    const normalizedInitialQuery = initialQuery.slice(0, 120)
    const initialHref = buildLibraryHref(pathname || `/${locale}/explore`, initialSource, normalizedInitialQuery, currentPage)
    const searchTimer = useRef<number | null>(null)
    const [queryInput, setQueryInput] = useState({
        observedHref: initialHref,
        activePath: pathname || `/${locale}/explore`,
        activeSource: initialSource,
        draft: normalizedInitialQuery,
        submittedHrefs: [] as string[],
        lastSubmitted: null as string | null,
    })
    // Match the whole request so a delayed response cannot undo a newer query or filter.
    // Browser history and unrelated URL changes remain authoritative.
    if (queryInput.observedHref !== initialHref) {
        const isSearchResponse = queryInput.submittedHrefs.includes(initialHref)
        setQueryInput({
            observedHref: initialHref,
            activePath: isSearchResponse ? queryInput.activePath : pathname || `/${locale}/explore`,
            activeSource: isSearchResponse ? queryInput.activeSource : initialSource,
            draft: isSearchResponse ? queryInput.draft : normalizedInitialQuery,
            submittedHrefs: isSearchResponse
                ? queryInput.submittedHrefs.filter((submitted) => submitted !== initialHref)
                : [],
            lastSubmitted: isSearchResponse ? queryInput.lastSubmitted : null,
        })
    }
    const queryDraft = queryInput.draft
    const podcastCopy = PODCAST_COPY[locale]
    const selectedSource = queryInput.activeSource
    const query = initialQuery.slice(0, 120)
    const returnHref = layout === "gallery" ? initialHref : undefined
    const featuredTasks = initialTasks.slice(0, FEATURED_COUNT)
    const feedTasks = initialTasks.slice(FEATURED_COUNT)

    function cancelPendingSearch() {
        if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
        searchTimer.current = null
        setQueryInput((current) => ({
            ...current,
            lastSubmitted: buildLibraryHref(current.activePath, current.activeSource, current.draft, 1),
        }))
    }

    function prepareLibraryNavigation(href: string) {
        if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
        searchTimer.current = null
        const target = new URL(href, window.location.origin)
        setQueryInput((current) => ({
            ...current,
            activePath: target.pathname,
            activeSource: target.searchParams.get("show") || "all",
            draft: target.searchParams.get("q") || "",
            submittedHrefs: [...current.submittedHrefs.slice(-31), href],
            lastSubmitted: href,
        }))
    }

    useEffect(() => {
        if (layout === "gallery") trackGrowthEvent("library_view", { locale })
    }, [layout, locale])

    useEffect(() => {
        const syncHistoryQuery = () => {
            if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
            searchTimer.current = null
            const params = new URLSearchParams(window.location.search)
            const historyQuery = params.get("q")?.slice(0, 120) || ""
            const historySource = params.get("show") || "all"
            const historyHref = buildLibraryHref(window.location.pathname, historySource, historyQuery, Number(params.get("page")) || 1)
            setQueryInput((current) => ({
                observedHref: current.observedHref,
                activePath: window.location.pathname,
                activeSource: historySource,
                draft: historyQuery,
                submittedHrefs: [historyHref],
                lastSubmitted: historyHref,
            }))
        }
        window.addEventListener("popstate", syncHistoryQuery)
        return () => window.removeEventListener("popstate", syncHistoryQuery)
    }, [])

    useEffect(() => {
        const trimmedDraft = queryDraft.trim().slice(0, 120)
        const nextHref = buildLibraryHref(queryInput.activePath, selectedSource, trimmedDraft, 1)
        const isCurrentSearch = trimmedDraft === initialQuery.trim().slice(0, 120)
            && selectedSource === initialSource && queryInput.activePath === pathname
        if (isCurrentSearch || nextHref === queryInput.lastSubmitted) return
        const timer = window.setTimeout(() => {
            searchTimer.current = null
            setQueryInput((current) => ({
                ...current,
                submittedHrefs: [...current.submittedHrefs.slice(-31), nextHref],
                lastSubmitted: nextHref,
            }))
            router.replace(nextHref, { scroll: false })
        }, 220)
        searchTimer.current = timer
        return () => window.clearTimeout(timer)
    }, [queryDraft, queryInput.activePath, queryInput.lastSubmitted, initialQuery, initialSource, pathname, router, selectedSource])

    if (initialStatus === "unavailable") {
        return <p className="py-10 text-sm text-muted-foreground" role="status">{copy.unavailable}</p>
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
                            role="standard"
                            // Match the landing's 1080px cap, section padding, border and 1px grid gaps.
                            sizes="(min-width: 1160px) 268.75px, (min-width: 1024px) calc(25vw - 21.25px), (min-width: 640px) calc(50vw - 25.5px), calc(100vw - 34px)"
                        />
                    </div>
                ))}
            </div>
        )
    }

    const clearHref = pathname ? buildLibraryHref(pathname, "all", "", 1) : "#"
    const loadMoreHref = pathname ? buildLibraryHref(pathname, selectedSource, query, currentPage + 1) : "#"

    return (
        <div className="space-y-5 sm:space-y-6">
            {intro ? (
                <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-end">
                    <div className="max-w-3xl">
                        <h1 className="max-w-[24ch] text-balance font-display text-[1.875rem] font-bold leading-[1.12] tracking-[-0.04em] text-foreground sm:text-4xl">{intro.title}</h1>
                    </div>
                    <section id="podcast-search" aria-label={podcastCopy.search} className="scroll-mt-24">
                        <div className="relative block w-full">
                            <label htmlFor="podcast-library-search" className="sr-only">{podcastCopy.search}</label>
                            <span className="relative block">
                                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <input
                                    id="podcast-library-search"
                                    type="search"
                                    value={queryDraft}
                                    maxLength={120}
                                    onChange={(event) => setQueryInput((current) => ({
                                        ...current,
                                        draft: event.target.value,
                                        lastSubmitted: null,
                                    }))}
                                    placeholder={podcastCopy.searchPlaceholder}
                                    className="h-11 w-full rounded-lg border border-border-strong bg-card pl-11 pr-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm"
                                />
                            </span>
                        </div>
                    </section>
                </header>
            ) : null}

            {showHeader ? (
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">{copy.title}</h2>
                </div>
            ) : null}

            <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:gap-6">
                <TopicHubLinks
                    locale={locale}
                    title={locale === "zh" ? "主题" : "Topics"}
                    compact
                    activePath={pathname ?? undefined}
                    query={queryDraft}
                    onNavigate={prepareLibraryNavigation}
                    className="min-w-0 flex-1"
                />
                <div id="podcast-sources" className="shrink-0 lg:max-w-64">
                    <label htmlFor="podcast-source-select" className="sr-only">{podcastCopy.sourceShelf}</label>
                    <select
                        id="podcast-source-select"
                        value={selectedSource}
                        onChange={(event) => {
                            const source = event.target.value
                            trackGrowthEvent("library_filter_source", { locale, source })
                            const href = buildLibraryHref(queryInput.activePath, source, queryDraft, 1)
                            prepareLibraryNavigation(href)
                            router.push(href, { scroll: false })
                        }}
                        className="h-11 w-full rounded-lg border border-border-strong bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <option value="all">{podcastCopy.sourceShelf}: {podcastCopy.all}</option>
                        {sourceItems.map(({ source, count }) => (
                            <option key={source.id} value={source.id}>{source.name} ({count})</option>
                        ))}
                    </select>
                </div>
            </div>

            {featuredTasks.length > 0 ? (
                <section id="podcast-curated" aria-labelledby="podcast-curated-heading" className="scroll-mt-24 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <h2 id="podcast-curated-heading" className="text-sm font-medium text-muted-foreground">{totalCount} {podcastCopy.resultCount}</h2>
                        {(selectedSource !== "all" || query) ? (
                            <Link
                                href={clearHref}
                                onNavigate={() => prepareLibraryNavigation(clearHref)}
                                scroll={false}
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                            >
                                {podcastCopy.clearFilters}
                            </Link>
                        ) : null}
                    </div>

                    <PodcastFeatureGrid
                        tasks={featuredTasks}
                        locale={locale}
                        copy={podcastCopy}
                        returnHref={returnHref}
                        onNavigate={cancelPendingSearch}
                    />
                </section>
            ) : (
                <section className="border border-dashed border-border-strong px-5 py-10 text-center">
                    <p className="text-sm text-muted-foreground" role="status">{podcastCopy.empty}</p>
                    {(selectedSource !== "all" || query) ? (
                        <Link
                            href={clearHref}
                            onNavigate={() => prepareLibraryNavigation(clearHref)}
                            scroll={false}
                            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            {podcastCopy.clearFilters}
                        </Link>
                    ) : null}
                </section>
            )}

            {feedTasks.length > 0 ? (
                <section id="podcast-feed" aria-labelledby="podcast-feed-heading" className="scroll-mt-24 space-y-4">
                    <h2 id="podcast-feed-heading" className="text-lg font-semibold text-foreground">{podcastCopy.recent}</h2>
                    <div className="grid min-w-0 gap-px bg-border lg:grid-cols-2">
                        {feedTasks.map((task) => (
                            <div key={task.id} className="min-w-0 bg-background">
                                <CompactEpisodeRow task={task} locale={locale} returnHref={returnHref} onNavigate={cancelPendingSearch} />
                            </div>
                        ))}
                    </div>
                    {hasMore ? (
                        <div className="flex justify-center pt-2">
                            <Link
                                href={loadMoreHref}
                                onNavigate={() => prepareLibraryNavigation(loadMoreHref)}
                                scroll={false}
                                onClick={() => trackGrowthEvent("library_load_more", {
                                    locale,
                                    page: currentPage + 1,
                                    source: selectedSource,
                                })}
                                className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
