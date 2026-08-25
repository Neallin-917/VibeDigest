"use client"

import { useState } from "react"
import { formatSeconds } from "./transcript"

type TranscriptSegment = {
    start: number
    end?: number
    text: string
}

type TranscriptPayload = {
    language: string | null
    segments?: TranscriptSegment[]
    text?: string
}

type Locale = "en" | "zh" | "ja"

const COPY = {
    en: {
        title: "Transcript",
        open: "Open transcript",
        close: "Close transcript",
        loading: "Loading transcript…",
        unavailable: "The transcript is temporarily unavailable.",
        more: "Show more",
    },
    zh: {
        title: "逐字稿",
        open: "展开查看",
        close: "收起",
        loading: "正在读取逐字稿…",
        unavailable: "逐字稿暂时不可用。",
        more: "继续加载",
    },
    ja: {
        title: "文字起こし",
        open: "開いて見る",
        close: "閉じる",
        loading: "文字起こしを読み込んでいます…",
        unavailable: "文字起こしは一時的に利用できません。",
        more: "さらに表示",
    },
} as const

const INITIAL_SEGMENT_COUNT = 120

export function TranscriptPanel({ taskId, locale }: { taskId: string; locale: Locale }) {
    const copy = COPY[locale]
    const [isOpen, setIsOpen] = useState(false)
    const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [payload, setPayload] = useState<TranscriptPayload | null>(null)
    const [visibleCount, setVisibleCount] = useState(INITIAL_SEGMENT_COUNT)

    async function loadTranscript() {
        setState("loading")
        try {
            const response = await fetch(`/api/tasks/${taskId}/transcript`, {
                headers: { Accept: "application/json" },
            })
            if (!response.ok) throw new Error("Transcript request failed")
            const nextPayload = await response.json() as TranscriptPayload
            if (!nextPayload.text && !nextPayload.segments?.length) {
                throw new Error("Transcript is empty")
            }
            setPayload(nextPayload)
            setState("ready")
        } catch {
            setState("error")
        }
    }

    function toggle() {
        const nextOpen = !isOpen
        setIsOpen(nextOpen)
        if (nextOpen && state === "idle") void loadTranscript()
    }

    const segments = payload?.segments || []
    const visibleSegments = segments.slice(0, visibleCount)

    return (
        <section className="glass-panel overflow-hidden" aria-labelledby="transcript-heading">
            <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-950/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:bg-white/[0.03]"
                aria-expanded={isOpen}
                aria-controls="task-transcript-content"
                onClick={toggle}
            >
                <span id="transcript-heading" className="text-lg font-semibold text-slate-950 dark:text-white">
                    {copy.title}
                </span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {isOpen ? copy.close : copy.open}
                </span>
            </button>

            {isOpen && (
                <div id="task-transcript-content" className="border-t border-slate-200 px-6 py-5 dark:border-white/10">
                    {state === "loading" && (
                        <p role="status" className="text-sm text-slate-500 dark:text-zinc-400">{copy.loading}</p>
                    )}
                    {state === "error" && (
                        <p role="alert" className="text-sm text-slate-500 dark:text-zinc-400">{copy.unavailable}</p>
                    )}
                    {state === "ready" && payload?.text && (
                        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-zinc-300">
                            {payload.text}
                        </p>
                    )}
                    {state === "ready" && visibleSegments.length > 0 && (
                        <div className="space-y-4">
                            <ol className="space-y-3">
                                {visibleSegments.map((segment, index) => (
                                    <li key={`${segment.start}-${index}`} className="grid gap-2 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                                        <span className="font-mono text-xs tabular-nums text-slate-400 dark:text-zinc-500">
                                            {formatSeconds(segment.start)}
                                        </span>
                                        <span className="leading-6 text-slate-700 dark:text-zinc-300">{segment.text}</span>
                                    </li>
                                ))}
                            </ol>
                            {visibleCount < segments.length && (
                                <button
                                    type="button"
                                    className="min-h-11 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/15 dark:text-zinc-300 dark:hover:border-emerald-400 dark:hover:text-emerald-400"
                                    onClick={() => setVisibleCount((count) => count + INITIAL_SEGMENT_COUNT)}
                                >
                                    {copy.more}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
