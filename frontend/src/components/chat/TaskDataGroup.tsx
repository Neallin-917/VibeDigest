'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

import { VideoPlayer } from '@/components/tasks/shared/VideoPlayer'
import { supportsVideoEmbed } from '@/components/tasks/VideoEmbed'
import { useI18n } from '@/components/i18n/I18nProvider'
import { KnowledgeUiBlocks } from './KnowledgeUiBlocks'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { isLocalUiDemo } from '@/lib/local-ui-demo'
import {
  type ChatUIDataParts,
  type TaskLifecycleStatus,
} from '@/lib/chat-ui'
import { normalizeTaskStatus, sanitizeErrorMessage } from '@/lib/safe-error'
import { subscribeToTask } from '@/lib/task-live'
import { getTaskDisplayTitle, isUsableTaskTitle } from '@/lib/task-display-title'
import {
  parseCurrentSummary,
  pickPreferredSummaryOutput,
  type CurrentSummary,
  type SummaryOutputCandidate,
} from '@/lib/summary-contract'

type TaskDataGroupProps = {
  taskStatus?: ChatUIDataParts['task-status']
  live?: boolean
  onRetryTask?: (taskId: string) => Promise<boolean>
}

type TaskSnapshot = {
  taskId: string
  status: TaskLifecycleStatus
  progress?: number
  videoTitle?: string
  thumbnailUrl?: string
  videoUrl?: string
  errorMessage?: string
}

type AudioData = {
  audioUrl: string
  coverUrl?: string
}

type EvidenceItem = {
  label: string
  text: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStandaloneTimestamp = (value: string) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

function mapTaskRow(row: Record<string, unknown>, fallbackTaskId: string): TaskSnapshot {
  return {
    taskId: typeof row.id === 'string' ? row.id : fallbackTaskId,
    status: normalizeTaskStatus(row.status),
    progress: typeof row.progress === 'number' ? row.progress : 0,
    videoTitle: asString(row.video_title),
    thumbnailUrl: asString(row.thumbnail_url),
    videoUrl: asString(row.video_url),
    errorMessage: asString(row.error_message),
  }
}

function resolveTaskSnapshot(
  seed: ChatUIDataParts['task-status'] | undefined,
  liveSnapshot: TaskSnapshot | null
) {
  if (!seed) return liveSnapshot
  if (!liveSnapshot) return seed
  if (liveSnapshot.taskId !== seed.taskId) return seed

  return {
    ...seed,
    ...liveSnapshot,
    videoTitle: liveSnapshot.videoTitle ?? seed.videoTitle,
    thumbnailUrl: liveSnapshot.thumbnailUrl ?? seed.thumbnailUrl,
    videoUrl: liveSnapshot.videoUrl ?? seed.videoUrl,
    errorMessage: liveSnapshot.errorMessage ?? seed.errorMessage,
  }
}

function useLiveTaskSnapshot(seed?: ChatUIDataParts['task-status'], live = false) {
  const [liveSnapshot, setLiveSnapshot] = useState<TaskSnapshot | null>(null)

  useEffect(() => {
    if (!live || !seed?.taskId) return

    return subscribeToTask(seed.taskId, row => {
      setLiveSnapshot(mapTaskRow(row, seed.taskId))
    })
  }, [live, seed?.taskId])

  return resolveTaskSnapshot(seed, liveSnapshot)
}

function parseAudioContent(content: string | undefined): AudioData | null {
  if (!content) return null

  try {
    const parsed = JSON.parse(content) as { audioUrl?: unknown; coverUrl?: unknown }
    if (typeof parsed.audioUrl !== 'string') return null
    return {
      audioUrl: parsed.audioUrl,
      coverUrl: typeof parsed.coverUrl === 'string' ? parsed.coverUrl : undefined,
    }
  } catch {
    return content.startsWith('http') ? { audioUrl: content } : null
  }
}

function useTaskOutputs(taskId: string | undefined, locale: string, enabled = true) {
  const [summary, setSummary] = useState<CurrentSummary | null>(null)
  const [audioData, setAudioData] = useState<AudioData | null>(null)
  const supabase = useMemo(() => (enabled ? createClient() : null), [enabled])

  useEffect(() => {
    if (!taskId || !supabase) return

    let cancelled = false

    const refresh = async () => {
      const { data } = await supabase
        .from('task_outputs')
        .select('kind, content, status, locale, created_at')
        .eq('task_id', taskId)
        .in('kind', ['summary', 'audio'])
        .order('created_at', { ascending: false })

      if (cancelled || !data) return

      const outputs = data as SummaryOutputCandidate[]
      const summaryOutput = pickPreferredSummaryOutput(outputs, locale)
      setSummary(summaryOutput ? parseCurrentSummary(summaryOutput.content) : null)

      const audioOutput = outputs.find(output => output.kind === 'audio')
      setAudioData(audioOutput ? parseAudioContent(asString(audioOutput.content)) : null)
    }

    void refresh()

    const channel = supabase
      .channel(`inline_task_outputs_${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_outputs', filter: `task_id=eq.${taskId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const next = payload.new
          if (!isRecord(next)) return
          const kind = asString(next.kind)
          if (kind === 'summary' || kind === 'audio') void refresh()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [locale, supabase, taskId])

  return { summary, audioData }
}

function createDemoSummary(locale: string): CurrentSummary {
  const isChinese = locale.toLowerCase().startsWith('zh')

  if (isChinese) {
    return {
      version: 4,
      language: 'zh',
      tl_dr: 'AI 的价值不在于增加工具数量，而在于把反馈、判断和行动连成更短的闭环。',
      overview: '本地演示用的固定内容。',
      keypoints: [
        { title: '先获得可用反馈', detail: '把关键结果提前展示，用户不必等待整段任务结束。', evidence: 'fixture' },
        { title: '界面只保留结论', detail: '播放器下方直接呈现一个结论和少量关键洞察。', evidence: 'fixture' },
      ],
      uiBlocks: [
        {
          kind: 'comparison_table',
          id: 'demo-comparison',
          title: '信息呈现方式',
          columns: ['纯文字', '结构化 UI'],
          rows: [
            { label: '对比关系', values: ['分散在段落中', '维度并列展示'], evidence: 'fixture' },
            { label: '来源依据', values: ['难以快速核对', '逐行保留依据'], evidence: 'fixture' },
          ],
        },
        {
          kind: 'bar_chart',
          id: 'demo-chart',
          title: '本地演示的组件覆盖',
          unit: '项',
          values: [
            { label: '洞察', value: 1, evidence: 'fixture' },
            { label: '对比表', value: 2, evidence: 'fixture' },
            { label: '柱状图', value: 3, evidence: 'fixture' },
          ],
        },
      ],
      sections: [],
    }
  }

  return {
    version: 4,
    language: 'en',
    tl_dr: 'AI becomes useful when feedback, judgment, and action form a shorter loop.',
    overview: 'Deterministic content for the local visual demo.',
    keypoints: [
      { title: 'Show useful feedback early', detail: 'Surface the first meaningful result before the whole task is complete.', evidence: 'fixture' },
      { title: 'Keep the interface focused', detail: 'Place one conclusion and only the essential insights under the player.', evidence: 'fixture' },
    ],
    uiBlocks: [
      {
        kind: 'comparison_table',
        id: 'demo-comparison',
        title: 'How information is presented',
        columns: ['Plain text', 'Structured UI'],
        rows: [
          { label: 'Comparison', values: ['Buried in prose', 'Dimensions stay aligned'], evidence: 'fixture' },
          { label: 'Source basis', values: ['Hard to scan', 'Retained per row'], evidence: 'fixture' },
        ],
      },
      {
        kind: 'bar_chart',
        id: 'demo-chart',
        title: 'Local demo component coverage',
        unit: 'blocks',
        values: [
          { label: 'Insight', value: 1, evidence: 'fixture' },
          { label: 'Table', value: 2, evidence: 'fixture' },
          { label: 'Chart', value: 3, evidence: 'fixture' },
        ],
      },
    ],
    sections: [],
  }
}

function useLocalDemoArtifact(
  seed: ChatUIDataParts['task-status'] | undefined,
  locale: string,
  enabled: boolean
) {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null)
  const [summary, setSummary] = useState<CurrentSummary | null>(null)

  useEffect(() => {
    if (!enabled || !seed?.taskId || !seed.videoUrl) return

    const isChinese = locale.toLowerCase().startsWith('zh')
    const videoTitle = isChinese
      ? '本地演示：AI 如何缩短反馈闭环'
      : 'Local demo: shortening the feedback loop with AI'

    const metadataTimer = window.setTimeout(() => {
      setSnapshot({
        taskId: seed.taskId,
        status: 'processing',
        progress: 35,
        videoTitle,
        videoUrl: seed.videoUrl,
      })
    }, 600)

    const summaryTimer = window.setTimeout(() => {
      setSnapshot({
        taskId: seed.taskId,
        status: 'completed',
        progress: 100,
        videoTitle,
        videoUrl: seed.videoUrl,
      })
      setSummary(createDemoSummary(locale))
    }, 1_700)

    return () => {
      window.clearTimeout(metadataTimer)
      window.clearTimeout(summaryTimer)
    }
  }, [enabled, locale, seed?.taskId, seed?.videoUrl])

  return { snapshot, summary }
}

function getStageLabel(
  t: ReturnType<typeof useI18n>['t'],
  status: TaskLifecycleStatus,
  progress?: number
) {
  if (status === 'failed') return t('chat.tools.status.statusFailed')
  if (status === 'completed') return t('chat.tools.status.statusReady')
  if (status === 'pending') return t('chat.tools.status.statusQueued')
  if ((progress ?? 0) >= 70) return t('chat.tools.status.steps.summarizeLabel')
  if ((progress ?? 0) >= 30) return t('chat.tools.status.steps.transcribeLabel')
  return t('chat.tools.status.steps.ingestLabel')
}

function KnowledgeCard({
  title,
  children,
  tone = 'default',
  meta,
}: {
  title: string
  children: React.ReactNode
  tone?: 'default' | 'lead'
  meta?: string
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl px-5',
        tone === 'lead'
          ? 'border border-primary/20 bg-primary/[0.045] py-5'
          : 'border border-border/80 bg-surface-raised/80 py-4'
      )}
    >
      {tone === 'lead' ? (
        <span aria-hidden="true" className="absolute inset-y-5 left-0 w-0.5 rounded-r-full bg-primary" />
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3
          className={cn(
            'font-semibold',
            tone === 'lead'
              ? 'text-[11px] uppercase tracking-[0.09em] text-primary'
              : 'text-sm text-foreground'
          )}
        >
          {title}
        </h3>
        {meta ? (
          <span aria-hidden="true" className="text-xs font-medium tabular-nums text-muted-foreground/70">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function collectEvidence(summary: CurrentSummary): EvidenceItem[] {
  const items: EvidenceItem[] = []
  const seen = new Set<string>()

  const add = (label: string, evidence: string) => {
    const text = evidence.trim()
    if (!text || isStandaloneTimestamp(text) || seen.has(text)) return
    seen.add(text)
    items.push({ label, text })
  }

  summary.keypoints.slice(0, 2).forEach((keypoint) => {
    add(keypoint.title, keypoint.evidence)
  })

  summary.uiBlocks?.forEach((block) => {
    if (block.kind === 'comparison_table') {
      block.rows.forEach((row) => add(`${block.title}: ${row.label}`, row.evidence))
      return
    }

    if (block.kind === 'bar_chart') {
      block.values.forEach((value) => add(`${block.title}: ${value.label}`, value.evidence))
      return
    }

    block.steps.forEach((step) => add(`${block.title}: ${step.title}`, step.evidence))
  })

  return items.slice(0, 8)
}

function EvidenceDisclosure({ title, items }: { title: string; items: EvidenceItem[] }) {
  if (items.length === 0) return null

  return (
    <details className="rounded-2xl border border-border/80 bg-surface-raised/80 px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2">
        <span>{title}</span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{String(items.length).padStart(2, '0')}</span>
      </summary>
      <ol className="mt-4 space-y-3 border-t border-border/70 pt-4">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
            <span aria-hidden="true" className="pt-0.5 text-[11px] font-medium tabular-nums text-primary/80">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">{item.label}</p>
              <blockquote className="mt-1 border-l border-primary/40 pl-3 text-sm leading-6 text-muted-foreground">
                {item.text}
              </blockquote>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}

function TaskDataGroupComponent({ taskStatus, live = false, onRetryTask }: TaskDataGroupProps) {
  const { t, locale } = useI18n()
  const [isRetrying, setIsRetrying] = useState(false)
  const isDemo = isLocalUiDemo()
  const liveSnapshot = useLiveTaskSnapshot(taskStatus, live && !isDemo)
  const demoArtifact = useLocalDemoArtifact(taskStatus, locale, isDemo)
  const snapshot = isDemo ? resolveTaskSnapshot(taskStatus, demoArtifact.snapshot) : liveSnapshot
  const { summary: persistedSummary, audioData } = useTaskOutputs(snapshot?.taskId, locale, !isDemo)
  const summary = isDemo ? demoArtifact.summary : persistedSummary

  if (!snapshot || !snapshot.videoUrl) return null

  const status = normalizeTaskStatus(snapshot.status)
  const title = getTaskDisplayTitle(
    snapshot.videoTitle,
    snapshot.videoUrl,
    t('chat.tools.status.videoTask')
  )
  const hasSourceMetadata = isUsableTaskTitle(snapshot.videoTitle) || Boolean(snapshot.thumbnailUrl)
  const canRenderVideo = supportsVideoEmbed(snapshot.videoUrl)
  const mediaType = canRenderVideo ? 'video' : 'audio'
  const canRenderMedia = canRenderVideo || Boolean(audioData?.audioUrl)
  const showPlayer = canRenderMedia && (hasSourceMetadata || status === 'completed')
  const conclusion = summary?.tl_dr || summary?.overview
  const keypoints = summary?.keypoints?.slice(0, 2) ?? []
  const evidenceItems = summary ? collectEvidence(summary) : []
  const stageLabel = getStageLabel(t, status, snapshot.progress)
  const safeError = snapshot.errorMessage
    ? sanitizeErrorMessage(snapshot.errorMessage, t('chat.directSubmit.unavailable'))
    : null
  const canRetry = status === 'failed' && Boolean(onRetryTask)
  const failureMessage = safeError ?? (
    status === 'failed' ? t('chat.directSubmit.unavailable') : null
  )

  const handleRetry = async () => {
    if (!onRetryTask || isRetrying) return
    setIsRetrying(true)
    const accepted = await onRetryTask(snapshot.taskId)
    if (!accepted) setIsRetrying(false)
  }

  return (
    <article className="w-full space-y-3" data-testid="inline-task-artifact">
      {showPlayer ? (
        <VideoPlayer
          mediaType={mediaType}
          videoUrl={snapshot.videoUrl}
          title={title}
          coverUrl={snapshot.thumbnailUrl}
          audioUrl={audioData?.audioUrl}
          audioCoverUrl={audioData?.coverUrl}
          sourceUrl={snapshot.videoUrl}
        />
      ) : (
        <section className="rounded-2xl border border-border bg-surface-raised px-5 py-4">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">
            {stageLabel}
          </p>
        </section>
      )}

      {showPlayer && !summary && status !== 'completed' && !safeError ? (
        <p className="px-1 text-sm text-muted-foreground" role="status" aria-live="polite">
          {stageLabel}
        </p>
      ) : null}

      {failureMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <p>{failureMessage}</p>
          {canRetry ? (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="rounded-lg border border-destructive/30 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:cursor-wait disabled:opacity-60"
            >
              {isRetrying ? t('chat.retryQueued') : t('chat.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {conclusion ? (
        <KnowledgeCard title={t('tasks.summaryStructured.tldrTitle')} tone="lead">
          <p className="text-[17px] font-medium leading-7 text-foreground">{conclusion}</p>
        </KnowledgeCard>
      ) : null}

      {keypoints.length > 0 ? (
        <KnowledgeCard
          title={t('tasks.summaryStructured.keypointsTitle')}
          meta={String(keypoints.length).padStart(2, '0')}
        >
          <ol>
            {keypoints.map((keypoint, index) => (
              <li
                key={`${keypoint.title}-${index}`}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span aria-hidden="true" className="pt-0.5 text-[11px] font-medium tabular-nums text-primary/80">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="text-sm font-semibold leading-5 text-foreground">{keypoint.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{keypoint.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </KnowledgeCard>
      ) : null}

      {summary?.uiBlocks?.length ? <KnowledgeUiBlocks blocks={summary.uiBlocks} /> : null}

      <EvidenceDisclosure
        title={t('tasks.summaryStructured.evidenceLabel')}
        items={evidenceItems}
      />

      {status === 'completed' && !summary && !safeError ? (
        <p className="px-1 text-sm text-muted-foreground">{t('chat.inlineResult.noSummary')}</p>
      ) : null}
    </article>
  )
}

export const TaskDataGroup = memo(TaskDataGroupComponent)
