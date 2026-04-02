
import { createClient } from "@/lib/supabase-server"
import type { Metadata, ResolvingMetadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { buildAlternateLanguages, buildLocalizedPath } from "@/lib/seo"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Heading, Text } from "@/components/ui/typography"
import { cn } from "@/lib/utils"

type Props = {
    params: Promise<{
        lang: string
        id: string
        slug: string
    }>
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
}

type SummaryKeyPoint = {
    title?: string
    detail?: string
    why_it_matters?: string
    evidence?: string
}

type SummarySectionItem = {
    content?: string
}

type SummarySection = {
    section_type?: string
    title?: string
    description?: string
    items?: SummarySectionItem[]
}

type StructuredSummary = {
    tl_dr?: string
    overview?: string
    keypoints?: SummaryKeyPoint[]
    sections?: SummarySection[]
}

async function getTaskAndOutputs(id: string) {
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
            .select('kind, content, status, locale')
            .eq('task_id', id)
            .order('created_at', { ascending: true }) // Ensure older outputs come first (or logic)
        outputs = data || []
    }

    return { task, outputs }
}

const stripCodeFence = (text: string) => {
    if (!text.startsWith('```')) return text
    const match = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
    return match ? match[1].trim() : text
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined

const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' ? value : undefined

const normalizeSummary = (value: unknown): StructuredSummary | null => {
    if (!isRecord(value)) return null

    const keypointsRaw = Array.isArray(value.keypoints) ? value.keypoints : []
    const keypoints = keypointsRaw
        .map((kp) => {
            const point = isRecord(kp) ? kp : {}
            return {
                title: asString(point.title),
                detail: asString(point.detail),
                why_it_matters: asString(point.why_it_matters),
                evidence: asString(point.evidence),
                startSeconds: asNumber(point.startSeconds),
            }
        })
        .filter((kp: SummaryKeyPoint) => kp.title || kp.detail || kp.why_it_matters || kp.evidence)

    const sectionsRaw = Array.isArray(value.sections) ? value.sections : []
    const sections = sectionsRaw
        .map((section) => {
            const safeSection = isRecord(section) ? section : {}
            const itemsRaw = Array.isArray(safeSection.items) ? safeSection.items : []
            const items = itemsRaw
                .map((item) => {
                    const safeItem = isRecord(item) ? item : {}
                    return {
                        content: asString(safeItem.content),
                    }
                })
                .filter((item: SummarySectionItem) => item.content)

            return {
                section_type: asString(safeSection.section_type),
                title: asString(safeSection.title),
                description: asString(safeSection.description),
                items,
            }
        })
        .filter((section: SummarySection) => section.items?.length || section.title || section.description)

    return {
        tl_dr: typeof value.tl_dr === 'string' ? value.tl_dr : undefined,
        overview: typeof value.overview === 'string' ? value.overview : undefined,
        keypoints,
        sections,
    }
}

const parseSummaryContent = (content: unknown): StructuredSummary | string | null => {
    if (!content) return null
    if (isRecord(content)) {
        return normalizeSummary(content)
    }
    if (typeof content !== 'string') return null

    const trimmed = content.trim()
    if (!trimmed) return null

    const jsonCandidate = stripCodeFence(trimmed)

    if (jsonCandidate.startsWith('{') || jsonCandidate.startsWith('[')) {
        try {
            const parsed = JSON.parse(jsonCandidate)
            return normalizeSummary(parsed) || trimmed
        } catch {
            return trimmed
        }
    }

    return trimmed
}

const formatSectionTitle = (value: string) =>
    value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())

const buildSummaryMarkdown = (content: unknown) => {
    const parsed = parseSummaryContent(content)
    if (!parsed) return ""
    if (typeof parsed === 'string') return parsed

    const parts: string[] = []

    if (parsed.tl_dr) {
        parts.push(`## In Brief\n${parsed.tl_dr}`)
    }
    if (parsed.overview) {
        parts.push(`## Overview\n${parsed.overview}`)
    }
    if (parsed.keypoints?.length) {
        const lines = parsed.keypoints.map((kp) => {
            const title = kp.title ? `${kp.title}` : ""
            const detail = kp.detail ? `${kp.detail}` : ""
            const why = kp.why_it_matters ? `Why it matters: ${kp.why_it_matters}` : ""
            const evidence = kp.evidence ? `Evidence: ${kp.evidence}` : ""
            const body = [detail, why, evidence].filter(Boolean).join(" ")
            return `- ${[title, body].filter(Boolean).join(": ")}`
        })
        parts.push(`## Key Points\n${lines.join("\n")}`)
    }
    if (parsed.sections?.length) {
        const sectionBlocks = parsed.sections.map((section) => {
            const title = section.title || (section.section_type ? formatSectionTitle(section.section_type) : "Section")
            const description = section.description ? `${section.description}\n` : ""
            const items = section.items?.length
                ? section.items
                    .map((item) => item.content)
                    .filter(Boolean)
                    .map((item) => `- ${item}`)
                    .join("\n")
                : ""
            return `### ${title}\n${description}${items}`.trim()
        })
        parts.push(`## Sections\n${sectionBlocks.join("\n\n")}`)
    }

    return parts.filter(Boolean).join("\n\n").trim()
}

const toPlainText = (markdown: string) =>
    markdown
        .replace(/[`*_>#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()

const truncate = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength - 3).trim()}...`
}

export async function generateMetadata(
    props: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    const params = await props.params;
    const { id, lang } = params
    const { task, outputs } = await getTaskAndOutputs(id)

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
    const summaryOutput = outputs.find(
        (output) =>
            output.kind === 'summary' &&
            output.status === 'completed' &&
            (output.locale === null || typeof output.locale === 'undefined')
    ) || outputs.find((output) => output.kind === 'summary' && output.status === 'completed')
    const summaryMarkdown = summaryOutput ? buildSummaryMarkdown(summaryOutput.content) : ""
    const summaryText = summaryMarkdown ? toPlainText(summaryMarkdown) : ""
    const fallbackDescription = `View the AI-generated summary and transcript for "${task.video_title || 'this video'}".`
    const description = summaryText ? truncate(summaryText, 160) : fallbackDescription

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
    const params = await props.params;
    const { id, lang, slug } = params
    const { task, outputs } = await getTaskAndOutputs(id)

    if (!task) {
        notFound()
    }

    // SLUG ENFORCEMENT
    const correctSlug = generateSlug(task.video_title || "video");
    if (slug !== correctSlug) {
        redirect(`/${lang}/tasks/${id}/${correctSlug}`);
    }

    const summaryOutput = outputs.find(
        (output) =>
            output.kind === 'summary' &&
            output.status === 'completed' &&
            (output.locale === null || typeof output.locale === 'undefined')
    ) || outputs.find((output) => output.kind === 'summary' && output.status === 'completed')
    const summaryMarkdown = summaryOutput ? buildSummaryMarkdown(summaryOutput.content) : ""
    const hasSummary = Boolean(summaryMarkdown)
    const summaryPlain = summaryMarkdown ? toPlainText(summaryMarkdown) : ""
    const summaryExcerpt = summaryPlain ? truncate(summaryPlain, 200) : ""
    const title = task.video_title || "Processed Video"
    const chatPath = `/${lang}/chat?task=${id}`
    const status = task.status || "pending"
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
    const statusLabelMap: Record<string, string> = {
        completed: "Completed",
        processing: "Processing",
        pending: "Queued",
        failed: "Failed",
    }
    const statusVariantMap: Record<string, "success" | "processing" | "secondary" | "destructive"> = {
        completed: "success",
        processing: "processing",
        pending: "secondary",
        failed: "destructive",
    }
    const statusLabel = statusLabelMap[status] || "Processing"
    const statusVariant = statusVariantMap[status] || "processing"

    return (
        <div className="relative z-10 w-full px-6 py-8 flex-1 min-h-0 overflow-y-auto">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="mx-auto max-w-6xl space-y-8">
                <header className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                        {task.is_demo && (
                            <Badge variant="outline">Community Example</Badge>
                        )}
                    </div>
                    <Heading as="h1" variant="display" className="text-balance">
                        {title}
                    </Heading>
                    {task.video_url && (
                        <Text tone="muted" className="break-all">
                            Source:{" "}
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
                            Summary
                        </Heading>
                        {hasSummary ? (
                            <div className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {summaryMarkdown}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <Text tone="muted">
                                Summary not available yet. Check back once processing completes.
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
                                Start Chat
                            </Link>
                            {task.video_url && (
                                <a
                                    href={task.video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                                >
                                    Open Original Video
                                </a>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}
