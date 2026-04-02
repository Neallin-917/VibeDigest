'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { VideoPlayer } from '@/components/tasks/shared/VideoPlayer'
import { supportsVideoEmbed } from '@/components/tasks/VideoEmbed'
import { Button } from '@/components/ui/button'
import { X, StickyNote, Quote, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

interface VideoDetailPanelProps {
  taskId: string
  onClose?: () => void
  className?: string
}

interface Task {
  id: string
  video_url: string
  video_title?: string
  thumbnail_url?: string
  status: string
}

interface MediaController {
  seek: (seconds: number) => void
}

type SummaryKeyPoint = {
  title: string
  detail: string
  startSeconds?: number
  why_it_matters?: string
  evidence?: string
}

type SummarySectionItem = {
  content: string
  metadata?: Record<string, unknown>
}

type SummarySection = {
  section_type: string
  title?: string
  description?: string
  items: SummarySectionItem[]
}

type StructuredSummary = {
  version?: number
  tl_dr?: string
  overview?: string
  keypoints: SummaryKeyPoint[]
  sections: SummarySection[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

const toTask = (value: unknown): Task | null => {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const videoUrl = asString(value.video_url)
  const status = asString(value.status)
  if (!id || !videoUrl || !status) return null
  return {
    id,
    video_url: videoUrl,
    video_title: asString(value.video_title),
    thumbnail_url: asString(value.thumbnail_url),
    status,
  }
}

const stripCodeFence = (text: string) => {
  if (!text.startsWith('```')) return text
  const match = text.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return match ? match[1].trim() : text
}

const normalizeSummary = (value: unknown): StructuredSummary | null => {
  if (!isRecord(value)) return null

  const keypointsRaw = Array.isArray(value.keypoints) ? value.keypoints : []
  const keypoints = keypointsRaw
    .map((kp) => {
      const point = isRecord(kp) ? kp : {}
      return {
        title: asString(point.title) ?? '',
        detail: asString(point.detail) ?? '',
        startSeconds: asNumber(point.startSeconds),
        why_it_matters: asString(point.why_it_matters),
        evidence: asString(point.evidence),
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
            content: asString(safeItem.content) ?? '',
            metadata: isRecord(safeItem.metadata) ? safeItem.metadata : undefined,
          }
        })
        .filter((item: SummarySectionItem) => item.content)

      return {
        section_type: asString(safeSection.section_type) ?? 'section',
        title: asString(safeSection.title),
        description: asString(safeSection.description),
        items,
      }
    })
    .filter((section: SummarySection) => section.items.length || section.title || section.description)

  return {
    version: asNumber(value.version),
    tl_dr: asString(value.tl_dr),
    overview: asString(value.overview),
    keypoints,
    sections,
  }
}

const parseSummaryContent = (content: unknown): StructuredSummary | null => {
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
      const parsed = JSON.parse(jsonCandidate) as unknown
      return normalizeSummary(parsed)
    } catch (e) {
      console.error("Failed to parse summary JSON", e)
    }
  }

  return {
    overview: trimmed,
    keypoints: [],
    sections: []
  }
}

// --- Sub-components ---

function KeypointCard({
  kp,
  idx,
  onSeek
}: {
  kp: SummaryKeyPoint
  idx: number
  onSeek: (seconds: number) => void
}) {
  const { t } = useI18n()
  const [showEvidence, setShowEvidence] = useState(true)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx * 0.1 }}
      className={cn(
        "rounded-2xl py-4 pr-4 pl-6 group relative overflow-hidden transition-all duration-300 border backdrop-blur-2xl shadow-glass",
        "bg-white/70 border-white/60 hover:shadow-[0_12px_30px_-18px_rgba(16,185,129,0.55)] hover:-translate-y-0.5",
        "dark:bg-zinc-900/60 dark:border-white/10 dark:hover:bg-zinc-900/70",
        "before:content-[''] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_55%)] dark:before:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_60%)] before:pointer-events-none"
      )}
    >
      <div className="flex-1 min-w-0">
        {/* Header & Title */}
        <div
          className="flex items-start justify-between gap-3 mb-2 cursor-pointer"
          onClick={() => kp.startSeconds !== undefined && onSeek(kp.startSeconds)}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30 dark:border-emerald-400/20 flex items-center justify-center text-[11px] font-semibold shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]">
              {idx + 1}
            </span>
            <h5 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              {kp.title}
            </h5>
          </div>
        </div>

        {/* Main Detail */}
        <p
          className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed cursor-pointer"
          onClick={() => kp.startSeconds !== undefined && onSeek(kp.startSeconds)}
        >
          {kp.detail}
        </p>

        {kp.why_it_matters && (
          <div className="mt-3 pt-3 flex items-start gap-2.5 border-t border-slate-100/80 dark:border-white/5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500/80 mt-[3px] shrink-0" />
            <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed italic">
              {kp.why_it_matters}
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Evidence (Grounding) */}
      {kp.evidence && (
        <div className="mt-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowEvidence(!showEvidence)
            }}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors uppercase tracking-[0.18em] select-none"
          >
            <Quote className="w-3 h-3" />
            <span>{t("tasks.summaryStructured.evidenceLabel")}</span>
            {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          
          <AnimatePresence>
            {showEvidence && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-2">
                    <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-3 relative shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]">
                      {/* Decorative quote mark */}
                    <Quote className="absolute top-2 left-2 w-4 h-4 text-slate-200 dark:text-white/5 rotate-180" />
                    <p className="text-[13px] italic text-slate-600 dark:text-slate-400 leading-relaxed pl-2 relative z-10">
                      &ldquo;{kp.evidence}&rdquo;
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

export function VideoDetailPanel({
  taskId,
  onClose,
  className
}: VideoDetailPanelProps) {
  const [task, setTask] = useState<Task | null>(null)
  const { t } = useI18n()
  const [summary, setSummary] = useState<StructuredSummary | null>(null)
  const [mediaController, setMediaController] = useState<MediaController | null>(null)
  const [audioData, setAudioData] = useState<{ audioUrl: string, coverUrl?: string } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const formatSectionTitle = (value: string) =>
    value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const splitOverview = (text: string): string[] => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return []

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
        const parts = Array.from(segmenter.segment(normalized))
          .map((segment) => segment.segment.trim())
          .filter(Boolean)
        if (parts.length <= 1) return [normalized]
        return parts.slice(0, 5)
      } catch {
        // Fall through to regex-based split.
      }
    }

    const protectDots = (value: string) => {
      const protectedDecimals = value.replace(/\b(\d)\.(\d)\b/g, '$1∎$2')
      const protectedAbbrev = protectedDecimals.replace(
        /\b(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|prof|sr|jr)\./gi,
        (match) => match.replace(/\./g, '∎')
      )
      return protectedAbbrev.replace(/\b(?:[A-Z]\.){2,}/g, (match) => match.replace(/\./g, '∎'))
    }

    const restoreDots = (value: string) => value.replace(/∎/g, '.')

    const protectedText = protectDots(normalized)
    const matches = protectedText.match(/[^。！？.!?]+[。！？.!?]?/g)
    const parts = (matches ?? [protectedText])
      .map((part) => restoreDots(part.trim()))
      .filter(Boolean)
    if (parts.length <= 1) return [normalized]
    return parts.slice(0, 5)
  }

  const parseAudioContent = (content: string | null | undefined): { audioUrl: string, coverUrl?: string } | null => {
    if (!content || typeof content !== 'string') return null
    try {
      const parsed = JSON.parse(content)
      return {
        audioUrl: parsed.audioUrl,
        coverUrl: parsed.coverUrl
      }
    } catch {
      // If it's just a raw URL string
      if (content.startsWith('http')) {
        return { audioUrl: content }
      }
    }
    return null
  }

  useEffect(() => {
    if (!taskId) return

    // States are reset via key-based remounting in parent
    const fetchData = async () => {
      // 1. Fetch Task
      const { data: t } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      const normalizedTask = toTask(t)
      if (normalizedTask) setTask(normalizedTask)

      // 2. Fetch Outputs (Summary & Audio)
      const { data: outputs } = await supabase
        .from('task_outputs')
        .select('*')
        .eq('task_id', taskId)
        .in('kind', ['summary', 'audio'])
        .order('created_at', { ascending: false })

      if (outputs) {
        // Prioritize source language (locale=null) which represents the canonical V4 summary
        // Fallback to any latest summary for backward compatibility
        const summaryOut = outputs.find(o => o.kind === 'summary' && o.status === 'completed' && o.locale === null) 
                        || outputs.find(o => o.kind === 'summary' && o.status === 'completed')

        if (summaryOut) {
          const parsed = parseSummaryContent(summaryOut.content)
          setSummary(parsed)
        }

        const audioOut = outputs.find(o => o.kind === 'audio')
        if (audioOut) {
          const parsed = parseAudioContent(audioOut.content)
          if (parsed?.audioUrl) {
            setAudioData(parsed)
          }
        }
      }
    }
    fetchData()

    // Realtime updates
    const channel = supabase.channel(`task_ctx_${taskId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${taskId}`
      }, (payload) => {
        const nextTask = toTask(payload.new)
        if (nextTask) {
          setTask(nextTask)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_outputs', filter: `task_id=eq.${taskId}`
      }, async (payload) => {
        const next = payload.new
        if (!isRecord(next)) return
        const kind = asString(next.kind)
        const status = asString(next.status)

        if (kind === 'summary' && status === 'completed') {
          const parsed = parseSummaryContent(next.content)
          setSummary(parsed)
        } else if (kind === 'audio') {
          // For audio, we accept any status as long as content parses to a URL
          const parsed = parseAudioContent(asString(next.content))
          if (parsed?.audioUrl) {
            setAudioData(parsed)
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'task_outputs', filter: `task_id=eq.${taskId}`
      }, async (payload) => {
        const next = payload.new
        if (!isRecord(next)) return
        const kind = asString(next.kind)
        const status = asString(next.status)

        if (kind === 'summary' && status === 'completed') {
          const parsed = parseSummaryContent(next.content)
          setSummary(parsed)
        } else if (kind === 'audio') {
          const parsed = parseAudioContent(asString(next.content))
          if (parsed?.audioUrl) {
            setAudioData(parsed)
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [taskId, supabase])

  // Determine media type based on task URL and available audio data
  const mediaType: 'video' | 'audio' = useMemo(() => {
    if (!task) return 'video'
    if (supportsVideoEmbed(task.video_url)) {
      return 'video'
    }
    if (audioData?.audioUrl) {
      return 'audio'
    }
    return 'video' // Default fallback
  }, [task, audioData])

  if (!task) return null

  const overviewParts = summary?.overview ? splitOverview(summary.overview) : []

  return (
    <div className={cn("h-full flex flex-col gap-5 overflow-hidden px-2 pt-2 pb-4", className)}>

      {/* Header */}
      <div className="flex items-center justify-between px-2 shrink-0">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span className="p-1.5 bg-white/50 dark:bg-white/10 rounded-lg shadow-sm ring-1 ring-white dark:ring-white/20 backdrop-blur-md">
            <StickyNote className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
          </span>
          {t("chat.contextPanel.title")}
        </h3>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-white/20 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto space-y-5 px-1 pb-4 custom-scrollbar">

        {/* Video Player Card */}
        <VideoPlayer
          mediaType={mediaType}
          videoUrl={task.video_url}
          title={task.video_title}
          coverUrl={task.thumbnail_url}
          audioUrl={audioData?.audioUrl}
          audioCoverUrl={audioData?.coverUrl}
          sourceUrl={task.video_url}
          onMediaReady={setMediaController}
        />

        {summary?.tl_dr && (
          <div className="relative rounded-3xl px-5 py-5 border border-white/60 dark:border-white/10 bg-white/75 dark:bg-zinc-900/60 shadow-glass backdrop-blur-2xl overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_58%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_60%)]" />
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <span className="h-5 w-1 rounded-full bg-emerald-400/80 dark:bg-emerald-400/70" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-400/30 dark:border-emerald-400/20 px-2 py-1 rounded-full">
                {t("tasks.summaryStructured.tldrTitle")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-emerald-300/50 to-transparent dark:from-emerald-500/30" />
            </div>
            <p className="relative z-10 text-[20px] font-semibold text-slate-900 dark:text-slate-100 leading-snug text-balance">
              {summary.tl_dr}
            </p>
          </div>
        )}

        {summary?.overview && (
          <div className="rounded-3xl px-5 py-4 border border-white/60 dark:border-white/10 bg-white/75 dark:bg-zinc-900/60 shadow-glass backdrop-blur-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-5 w-1 rounded-full bg-emerald-400/80 dark:bg-emerald-400/70" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.28em] text-slate-700 dark:text-slate-200">
                {t("tasks.summaryStructured.overviewTitle")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-emerald-300/50 to-transparent dark:from-emerald-500/30" />
            </div>
            <div className="space-y-3">
              {overviewParts.map((part, index) => (
                <div key={`overview-${index}`} className="flex items-start gap-3">
                  {/* Keep the badge a fixed circle. Without shrink-0, long lines can squeeze it into an oval/line. */}
                  <span className="mt-0.5 h-6 w-6 flex-none rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-400/30 dark:border-emerald-400/20 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center leading-none tabular-nums">
                    {index + 1}
                  </span>
                  {/* Use an integer px line-height to avoid subpixel drift that makes tiny numerals look inconsistently bold. */}
                  <p className="min-w-0 flex-1 text-[16px] text-slate-800 dark:text-slate-300 leading-7 text-balance">
                    {part}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider for Key Insights */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <span data-testid="header-key-insights" className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-[0.32em]">
            {t("tasks.summaryStructured.keypointsTitle")}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
        </div>

        {/* Loading State */}
        {!summary && task.status === 'processing' && (
          <div className="rounded-2xl px-4 py-6 text-center border border-white/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/40 shadow-glass backdrop-blur-xl">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 dark:border-emerald-400 mb-2"></div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("chat.contextPanel.analyzingVideo")}</p>
          </div>
        )}

        {/* Empty State */}
        {!summary && task.status === 'completed' && (
          <div className="rounded-2xl px-4 py-5 text-center text-[12px] text-slate-500 dark:text-slate-400 border border-white/60 dark:border-white/10 bg-white/70 dark:bg-zinc-900/40 shadow-glass backdrop-blur-xl">
            {t("chat.contextPanel.noSummary")}
          </div>
        )}

        {/* Insights Cards */}
        {summary?.keypoints?.length ? (
          <div className="relative pl-8 space-y-3">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-400/60 via-emerald-400/20 to-transparent dark:from-emerald-400/40 dark:via-emerald-400/20" />
            {summary.keypoints.map((kp, idx) => (
              <KeypointCard 
                key={idx} 
                kp={kp} 
                idx={idx} 
                onSeek={(seconds) => mediaController?.seek(seconds)} 
              />
            ))}
          </div>
        ) : null}

        {summary?.sections?.length ? (
          <>
            <div className="flex items-center gap-3 px-2 pt-2">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-[0.32em]">
                {t("tasks.summaryStructured.sectionsTitle")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
            </div>
            <div className="space-y-4">
              {summary.sections.map((section, sectionIndex) => {
                const title = section.title || formatSectionTitle(section.section_type)
                return (
                  <div
                    key={`${section.section_type}-${sectionIndex}`}
                    className="rounded-3xl border border-white/60 dark:border-white/10 bg-white/75 dark:bg-zinc-900/60 shadow-glass backdrop-blur-2xl overflow-hidden flex flex-col"
                  >
                    <div className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-md px-5 py-4 border-b border-white/40 dark:border-white/10 flex items-center justify-start gap-3">
                      <span className="h-5 w-1 rounded-full bg-emerald-400/80 dark:bg-emerald-400/70" />
                      <h4 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">
                        {title}
                      </h4>
                    </div>
                    
                    <div className="p-5 pt-4">
                      {section.description && (
                        <p className="text-[13.5px] text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                          {section.description}
                        </p>
                      )}
                      <div className="space-y-3">
                      {section.items.map((item, itemIndex) => {
                        return (
                          <div
                            key={`${section.section_type}-${sectionIndex}-${itemIndex}`}
                            className="pl-3 border-l-2 border-emerald-400/40 dark:border-emerald-400/30"
                          >
                            <p className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          </>
        ) : null}

      </div>
    </div>
  )
}
