'use client'

import { memo, useEffect, useState } from 'react'

import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type ChatUIDataParts,
  type TaskLifecycleStatus,
} from '@/lib/chat-ui'
import { normalizeTaskStatus, sanitizeErrorMessage } from '@/lib/safe-error'
import { getTaskPlanState, type TaskSnapshot, type TaskPlanStepKey } from '@/lib/task-progress'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
} from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { subscribeToTask } from '@/lib/task-live'
import { getTaskDisplayTitle } from '@/lib/task-display-title'

type TaskDataGroupProps = {
  taskStatus?: ChatUIDataParts['task-status']
  showProgress: boolean
  showPlan: boolean
  live?: boolean
  onOpenPanel?: (taskId: string) => void
}

function mapTaskRow(row: Record<string, unknown>, fallbackTaskId: string): TaskSnapshot {
  return {
    taskId: typeof row.id === 'string' ? row.id : fallbackTaskId,
    status: normalizeTaskStatus(row.status),
    progress: typeof row.progress === 'number' ? row.progress : 0,
    videoTitle: typeof row.video_title === 'string' ? row.video_title : undefined,
    thumbnailUrl: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : undefined,
    videoUrl: typeof row.video_url === 'string' ? row.video_url : undefined,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : undefined,
  }
}

function getStatusIcon(status: TaskLifecycleStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case 'failed':
      return <AlertCircle className="size-4 text-red-500" />
    case 'processing':
      return <Loader2 className="size-4 animate-spin text-blue-500" />
    default:
      return <Clock3 className="size-4 text-amber-500" />
  }
}

function resolveTaskSnapshot(
  seed: ChatUIDataParts['task-status'] | undefined,
  liveSnapshot: TaskSnapshot | null
) {
  if (!seed) return liveSnapshot
  if (!liveSnapshot) return seed
  return liveSnapshot.taskId === seed.taskId ? liveSnapshot : seed
}

function useLiveTaskSnapshot(seed?: ChatUIDataParts['task-status'], live = false) {
  const [liveSnapshot, setLiveSnapshot] = useState<TaskSnapshot | null>(null)

  useEffect(() => {
    if (!live || !seed?.taskId) return

    const taskId = seed.taskId
    const unsubscribe = subscribeToTask(taskId, row => {
      setLiveSnapshot(mapTaskRow(row, taskId))
    })

    return () => {
      unsubscribe()
    }
  }, [live, seed?.taskId])

  return resolveTaskSnapshot(seed, liveSnapshot)
}

function TaskStatusCard({
  snapshot,
  showProgress,
  showPlan,
  onOpenPanel,
}: {
  snapshot: TaskSnapshot
  showProgress: boolean
  showPlan: boolean
  onOpenPanel?: (taskId: string) => void
}) {
  const { t } = useI18n()
  const normalizedSnapshot = {
    ...snapshot,
    status: normalizeTaskStatus(snapshot.status),
    errorMessage: snapshot.errorMessage
      ? sanitizeErrorMessage(snapshot.errorMessage, t('chat.directSubmit.unavailable'))
      : undefined,
  }
  const displayTitle = getTaskDisplayTitle(
    snapshot.videoTitle,
    snapshot.videoUrl,
    t('chat.tools.status.videoTask')
  )

  const statusLabel =
    normalizedSnapshot.status === 'completed'
      ? t('chat.tools.status.statusReady')
      : normalizedSnapshot.status === 'failed'
        ? t('chat.tools.status.statusFailed')
        : normalizedSnapshot.status === 'processing'
          ? t('chat.tools.status.statusProcessing')
          : t('chat.tools.status.statusQueued')

  const plan = getTaskPlanState(normalizedSnapshot)
  const showDetailedProgress = normalizedSnapshot.status !== 'completed'

  const getStepCopy = (key: TaskPlanStepKey) => {
    switch (key) {
      case 'queued':
        return {
          label: t('chat.tools.status.steps.queuedLabel'),
          description: t('chat.tools.status.steps.queuedDesc'),
        }
      case 'ingest':
        return {
          label: t('chat.tools.status.steps.ingestLabel'),
          description: t('chat.tools.status.steps.ingestDesc'),
        }
      case 'transcribe':
        return {
          label: t('chat.tools.status.steps.transcribeLabel'),
          description: t('chat.tools.status.steps.transcribeDesc'),
        }
      case 'summarize':
        return {
          label: t('chat.tools.status.steps.summarizeLabel'),
          description: t('chat.tools.status.steps.summarizeDesc'),
        }
      case 'finalize':
        return {
          label: t('chat.tools.status.steps.finalizeLabel'),
          description: t('chat.tools.status.steps.finalizeDesc'),
        }
    }
  }

  return (
    <Card className="w-full overflow-hidden border border-white/10 bg-zinc-950/70 shadow-none">
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          {snapshot.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic external thumbnail URLs are rendered directly without Next image optimization
            <img
              src={snapshot.thumbnailUrl}
              alt={displayTitle}
              className="h-14 w-24 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="line-clamp-2 text-sm font-medium leading-6 text-zinc-100">
              {displayTitle}
            </h3>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {getStatusIcon(normalizedSnapshot.status)}
              <span>{statusLabel}</span>
            </div>
          </div>
        </div>

        {showProgress && showDetailedProgress ? (
          <div className="space-y-2">
            <div>
              <div className="text-sm font-semibold text-zinc-100">{t('chat.tools.status.processingPlan')}</div>
              <div className="text-xs text-zinc-400">{t('chat.tools.status.processingPlanDesc')}</div>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{t('chat.tools.status.progressCount', { completed: plan.completedCount, total: plan.totalCount })}</span>
              <span>{plan.progressPercent}%</span>
            </div>
            <Progress value={plan.progressPercent} className="h-1.5 bg-white/10" />
          </div>
        ) : null}

        {showPlan && showDetailedProgress ? (
          <div className="space-y-4">
            {plan.steps.map((step, index) => {
              const copy = getStepCopy(step.key)

              return (
                <div key={step.key} className="flex gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
                      step.state === 'complete'
                        ? 'border-emerald-400/80 bg-emerald-500/15 text-emerald-300'
                        : step.state === 'current'
                          ? 'border-cyan-400/80 bg-cyan-500/10 text-cyan-300'
                          : step.state === 'failed'
                            ? 'border-red-400/60 bg-red-500/10 text-red-300'
                            : 'border-white/10 bg-white/5 text-zinc-500'
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div
                      className={cn(
                        'text-sm font-medium',
                        step.state === 'pending' ? 'text-zinc-500' : 'text-zinc-100'
                      )}
                    >
                      {copy.label}
                    </div>
                    <div className="text-sm leading-6 text-zinc-400">{copy.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {normalizedSnapshot.errorMessage ? (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {normalizedSnapshot.errorMessage}
          </div>
        ) : null}

        {normalizedSnapshot.status === 'completed' && onOpenPanel ? (
          <div className="pt-1">
            <Button
              onClick={() => onOpenPanel(snapshot.taskId)}
              size="sm"
              className="h-9 bg-zinc-100 px-4 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
            >
              {t('chat.tools.status.viewSummary')}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function TaskDataGroupComponent({
  taskStatus,
  showProgress,
  showPlan,
  live = false,
  onOpenPanel,
}: TaskDataGroupProps) {
  const snapshot = useLiveTaskSnapshot(taskStatus, live)

  if (!snapshot) return null

  return (
    <TaskStatusCard
      snapshot={snapshot}
      showProgress={showProgress}
      showPlan={showPlan}
      onOpenPanel={onOpenPanel}
    />
  )
}

export const TaskDataGroup = memo(TaskDataGroupComponent)
