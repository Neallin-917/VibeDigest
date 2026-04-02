"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { PlayCircle, Loader2, Sparkles } from "lucide-react"
import { useI18n } from "@/components/i18n/I18nProvider"
import { createClient } from "@/lib/supabase"
import { motion } from "framer-motion"

export type TaskOutput = {
    kind: string
    content: string | object
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
}

const getPlatformFromUrl = (url: string) => {
    try {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname.toLowerCase()
        if (hostname.includes('bilibili')) return 'Bilibili'
        if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'YouTube'
        if (hostname.includes('tiktok')) return 'TikTok'
        if (hostname.includes('apple.com')) return 'Apple Podcast'
        if (hostname.includes('xiaoyuzhoufm.com')) return 'Xiaoyuzhou'
        return 'Web'
    } catch {
        return 'Link'
    }
}

function TemplateCard({ task }: { task: Task }) {
    const { locale } = useI18n()
    const platform = getPlatformFromUrl(task.video_url)
    const showAuthor = task.author && task.author !== "Unknown"

    return (
        <Link
            href={`/${locale}/chat?task=${task.id}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 dark:bg-gradient-to-br dark:from-white/[0.05] dark:to-transparent backdrop-blur-sm cursor-pointer transition-all duration-300 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-lg dark:hover:shadow-[0_8px_32px_rgba(62,207,142,0.15)] hover:scale-[1.02] h-full"
        >
            {/* Thumbnail Area */}
            <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-black/40 shrink-0">
                {task.thumbnail_url ? (
                    <Image
                        src={task.thumbnail_url}
                        alt={task.video_title || "Video thumbnail"}
                        fill
                        className="object-cover transition-all duration-700 group-hover:scale-110 group-hover:contrast-[1.1]"
                        referrerPolicy="no-referrer"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <PlayCircle className="h-12 w-12 text-white/20 group-hover:text-primary transition-colors duration-300" />
                    </div>
                )}

                {/* Gradient Overlay - Cinematic Fade */}
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10" />

                {/* Platform Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-medium text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/10">
                        {platform}
                    </span>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-1 flex-col p-4">
                <h3 className="font-semibold text-foreground line-clamp-2 text-sm leading-snug group-hover:text-slate-900 dark:group-hover:text-white transition-colors mb-2">
                    {task.video_title || task.video_url}
                </h3>

                {/* Author Info */}
                <div className="mt-auto flex items-center justify-between gap-3">
                    {showAuthor ? (
                        <div className="flex items-center gap-2 min-w-0">
                            {task.author_image_url ? (
                                <div className="relative h-5 w-5 shrink-0 rounded-full overflow-hidden border border-slate-200 dark:border-white/10">
                                    <Image
                                        src={task.author_image_url}
                                        alt={task.author || "Author"}
                                        fill
                                        className="object-cover"
                                        referrerPolicy="no-referrer"
                                        sizes="24px"
                                    />
                                </div>
                            ) : (
                                <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center border border-slate-300 dark:border-white/10 shrink-0">
                                    <span className="text-[10px] text-slate-600 dark:text-white/70 font-bold leading-none">
                                        {(task.author || "U").charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            )}
                            <span className="text-xs font-medium text-slate-600 dark:text-white/60 truncate">
                                {task.author}
                            </span>
                        </div>
                    ) : (
                        <div className="h-5" />
                    )}
                </div>
            </div>
        </Link>
    )
}

export function CommunityTemplates({ limit, showHeader = true, initialTasks = [] }: { limit?: number, showHeader?: boolean, initialTasks?: Task[] }) {
    const { t } = useI18n()
    const [tasks, setTasks] = useState<Task[]>(initialTasks)
    const [loading, setLoading] = useState(initialTasks.length === 0)
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        if (initialTasks.length > 0) {
            return
        }

        let cancelled = false

        async function fetchDemoTasks() {
            setLoading(true)
            const timeoutMs = 6000
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            const timeout = new Promise<null>((resolve) => {
                timeoutId = setTimeout(() => resolve(null), timeoutMs)
            })

            try {
                let query = supabase
                    .from('tasks')
                    .select(`
                        id, 
                        video_url, 
                        video_title, 
                        thumbnail_url, 
                        status, 
                        created_at, 
                        author, 
                        author_image_url
                    `)
                    .eq('is_demo', true)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })

                if (limit) {
                    query = query.limit(limit)
                }

                const result = await Promise.race([query, timeout])

                if (cancelled || result === null) {
                    if (result === null) {
                        console.warn("Demo tasks fetch timed out.")
                    }
                    return
                }

                const { data, error } = result

                if (data) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setTasks(data as any as Task[])
                } else if (error) {
                    console.error("Error fetching demo tasks:", error)
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Error fetching demo tasks:", error)
                }
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchDemoTasks()

        return () => {
            // Prevent state updates after unmount.
            cancelled = true
        }
    }, [limit, initialTasks.length, supabase])

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground/50">
                <Loader2 className="h-6 w-6 animate-spin mr-3 text-primary" />
                <span className="text-sm font-medium tracking-wide">INITIALIZING DATABASE...</span>
            </div>
        )
    }

    if (tasks.length === 0) {
        return null
    }

    return (
        <div className="space-y-6">
            {showHeader && (
                <div className="flex items-end justify-between px-1">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <Sparkles className="h-5 w-5 text-primary" />
                            {t("dashboard.communityExamples") || "Community"}
                        </h2>
                        <span className="text-sm text-slate-500 dark:text-white/40 font-medium tracking-wide">
                            {t("dashboard.communityExamplesHint") || "Explore what others are creating"}
                        </span>
                    </div>
                </div>
            )}

            <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {tasks.map((task) => (
                    <TemplateCard key={task.id} task={task} />
                ))}
            </motion.div>
        </div>
    )
}
