"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatSeconds, parseScriptRawPayload } from "@/components/tasks/transcript"

export type TranscriptBlock = {
  start: number
  end: number
  text: string
  segStartIdx: number
  segEndIdx: number
}

export function buildTranscriptBlocks(scriptRawContent?: string): TranscriptBlock[] {
  const payload = parseScriptRawPayload(scriptRawContent)
  const segments = Array.isArray(payload?.segments) ? payload?.segments : []
  if (!segments.length) return []

  // Heuristics tuned for "timeline feel":
  // - keep blocks readable and clickable
  // - split on larger time gaps (topic shifts)
  // - prevent huge blocks for long videos
  const maxChars = 520
  const minCharsToSplitOnPunct = 120
  const gapSeconds = 2.5
  const maxDurationSeconds = 45
  const maxSegmentsPerBlock = 28

  const blocks: TranscriptBlock[] = []
  let buf: string[] = []
  let blockStart = 0
  let blockEnd = 0
  let segStartIdx = -1
  let lastEnd = -Infinity

  const push = (endIdx: number) => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim()
    if (!text) return
    blocks.push({
      start: blockStart,
      end: blockEnd,
      text,
      segStartIdx,
      segEndIdx: endIdx,
    })
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const start = typeof seg?.start === "number" && Number.isFinite(seg.start) ? seg.start : null
    const end = typeof seg?.end === "number" && Number.isFinite(seg.end) ? seg.end : start
    const rawText = (seg?.text || "").toString()
    const text = rawText.replace(/\s+/g, " ").trim()
    if (start === null || start < 0) continue
    if (!text) continue

    const isNewBlock = buf.length === 0
    if (isNewBlock) {
      blockStart = start
      blockEnd = end ?? start
      segStartIdx = i
      lastEnd = end ?? start
      buf.push(text)
      continue
    }

    const gap = start - (Number.isFinite(lastEnd) ? lastEnd : start)
    const nextTextLen = buf.join(" ").length + 1 + text.length
    const nextDuration = (end ?? start) - blockStart
    const nextSegCount = i - segStartIdx + 1
    const endsWithPunct = /[.!?。！？]\s*$/.test(buf[buf.length - 1] || "")

    const shouldSplit =
      gap >= gapSeconds ||
      nextTextLen >= maxChars ||
      nextDuration >= maxDurationSeconds ||
      nextSegCount >= maxSegmentsPerBlock ||
      (endsWithPunct && nextTextLen >= minCharsToSplitOnPunct)

    if (shouldSplit) {
      push(i - 1)
      buf = []
      blockStart = start
      blockEnd = end ?? start
      segStartIdx = i
      lastEnd = end ?? start
      buf.push(text)
      continue
    }

    buf.push(text)
    blockEnd = end ?? start
    lastEnd = end ?? start
  }

  if (buf.length && segStartIdx >= 0) push(segments.length - 1)
  return blocks
}

export function TranscriptTimeline({
  scriptRawContent,
  canSeek,
  onSeek,
  emptyFallback,
}: {
  scriptRawContent?: string
  canSeek: boolean
  onSeek: (seconds: number) => void
  emptyFallback?: React.ReactNode
}) {
  const blocks = useMemo(() => buildTranscriptBlocks(scriptRawContent), [scriptRawContent])
  const [visibleCount, setVisibleCount] = useState(120)

  if (!scriptRawContent) return emptyFallback ?? null
  if (!blocks.length) return emptyFallback ?? null

  const visible = blocks.slice(0, visibleCount)
  const hasMore = visibleCount < blocks.length

  return (
    <div className="space-y-2">
      {!canSeek ? (
        <div className="text-xs text-muted-foreground">Player not seekable. (Some sources may not support in-place seeking.)</div>
      ) : null}

      <div className="space-y-2">
        {visible.map((b) => (
          <button
            key={`blk-${b.segStartIdx}-${b.start}`}
            type="button"
            onClick={() => onSeek(b.start)}
            disabled={!canSeek}
            className="w-full text-left rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 transition-colors"
            title={canSeek ? `Seek to ${formatSeconds(b.start)}` : undefined}
          >
            <div className="flex items-baseline gap-3">
              <div className="text-xs font-mono text-primary/90 shrink-0">{formatSeconds(b.start)}</div>
              <div className="text-sm text-foreground/90 leading-relaxed line-clamp-3">{b.text}</div>
            </div>
          </button>
        ))}
      </div>

      {hasMore ? (
        <div className="pt-2 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="bg-black/20 border border-white/10 hover:bg-black/30"
            onClick={() => setVisibleCount((n) => Math.min(n + 120, blocks.length))}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}


