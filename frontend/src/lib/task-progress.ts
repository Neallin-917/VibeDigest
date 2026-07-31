import type { TaskLifecycleStatus } from '@/lib/chat-ui'

export const TASK_PLAN_STEPS = [
  'queued',
  'ingest',
  'transcribe',
  'summarize',
  'finalize',
] as const

export type TaskPlanStepKey = (typeof TASK_PLAN_STEPS)[number]
export type TaskPlanStepState = 'complete' | 'current' | 'pending' | 'failed'

export type TaskSnapshot = {
  taskId: string
  status: TaskLifecycleStatus
  progress?: number
  videoTitle?: string
  thumbnailUrl?: string
  videoUrl?: string
  errorMessage?: string
}

const STEP_THRESHOLDS: Array<{ key: TaskPlanStepKey; minProgress: number }> = [
  { key: 'queued', minProgress: 0 },
  { key: 'ingest', minProgress: 15 },
  { key: 'transcribe', minProgress: 30 },
  { key: 'summarize', minProgress: 70 },
  { key: 'finalize', minProgress: 90 },
]

export function getResolvedTaskProgress(status: TaskLifecycleStatus, progress?: number) {
  if (status === 'completed') return 100
  return typeof progress === 'number' ? Math.max(0, Math.min(progress, 100)) : 0
}

export function getTaskPlanState(snapshot: TaskSnapshot) {
  const resolvedProgress = getResolvedTaskProgress(snapshot.status, snapshot.progress)
  const activeStepIndex = STEP_THRESHOLDS.reduce(
    (acc, step, idx) => (resolvedProgress >= step.minProgress ? idx : acc),
    0
  )

  const completedCount =
    snapshot.status === 'completed'
      ? TASK_PLAN_STEPS.length
      : Math.max(activeStepIndex, 0)

  const steps = TASK_PLAN_STEPS.map((key, index) => {
    let state: TaskPlanStepState = 'pending'

    if (snapshot.status === 'failed') {
      if (index < activeStepIndex) state = 'complete'
      else if (index === activeStepIndex) state = 'failed'
    } else if (snapshot.status === 'completed' || index < activeStepIndex) {
      state = 'complete'
    } else if (index === activeStepIndex) {
      state = 'current'
    }

    return { key, state }
  })

  return {
    steps,
    resolvedProgress,
    completedCount,
    totalCount: TASK_PLAN_STEPS.length,
    progressPercent: Math.round((completedCount / TASK_PLAN_STEPS.length) * 100),
    activeStepKey:
      activeStepIndex >= 0 ? STEP_THRESHOLDS[activeStepIndex]?.key ?? TASK_PLAN_STEPS[0] : undefined,
  }
}
