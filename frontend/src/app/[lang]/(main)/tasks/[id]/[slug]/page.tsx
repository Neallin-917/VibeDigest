
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
    created_at?: string | null
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
            .select('kind, content, status, locale, created_at')
            .eq('task_id', id)
            .order('created_at', { ascending: false })
        outputs = data || []
    }

    return { task, outputs }
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
    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[])
    const summaryText = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 160) : ""
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

    const summaryOutput = pickPreferredSummaryOutput(outputs as SummaryOutputCandidate[])
    const summaryMarkdown = summaryOutput ? buildSummaryMarkdownFromContent(summaryOutput.content) : ""
    const hasSummary = Boolean(summaryMarkdown)
    const summaryExcerpt = summaryOutput ? buildSummaryExcerptFromContent(summaryOutput.content, 200) : ""
    const title = task.video_title || "Processed Video"
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
                                {status === "failed"
                                    ? "This task did not complete. Continue in chat to retry it."
                                    : "Summary not available yet. Check back once processing completes."}
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
                                {status === "failed" ? "Continue in Chat" : "Start Chat"}
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
