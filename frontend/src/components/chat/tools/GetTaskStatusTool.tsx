'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GetTaskStatusToolProps, TaskStatusOutput } from './types'
import { isRecord, mapRowToTask } from './types'

export function GetTaskStatusTool({
  state,
  input,
  output,
  errorText,
  onViewClick
}: GetTaskStatusToolProps) {
  const { t } = useI18n()
  const [liveTask, setLiveTask] = useState<TaskStatusOutput | null>(null)
  const [recovered, setRecovered] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  /** Fetch the latest task snapshot from Supabase. */
  const fetchTask = useCallback(async (taskId: string) => {
    const { data } = await supabase
      .from('tasks')
      .select('id,status,progress,video_title,thumbnail_url,video_url,error_message,updated_at')
      .eq('id', taskId)
      .single()

    if (data) {
      return mapRowToTask(data as Record<string, unknown>, taskId)
    }
    return null
  }, [supabase])

  // ---- Error Recovery (Bug 1) ----
  // When output carries an error but also a taskId, the task might simply
  // not have been visible yet due to replication lag.  We retry once after 1s.
  useEffect(() => {
    if (!output?.error || !output?.taskId) return
    const isActive = { current: true }

    const timer = setTimeout(async () => {
      const nextTask = await fetchTask(output.taskId)
      if (nextTask && isActive.current) {
        setLiveTask(nextTask)
        setRecovered(true)
      }
    }, 1_000)

    return () => {
      isActive.current = false
      clearTimeout(timer)
    }
  }, [output?.error, output?.taskId, fetchTask])

  // ---- Realtime subscription ----
  useEffect(() => {
    const taskId = output?.taskId
    // Skip if there is an error AND we haven't recovered yet
    if (!taskId || (output?.error && !recovered)) return

    const isActive = { current: true }

    const loadInitialTask = async () => {
      const nextTask = await fetchTask(taskId)
      if (nextTask && isActive.current) {
        setLiveTask(nextTask)
      }
    }

    void loadInitialTask()

    // Realtime subscription (single source of truth for live updates)
    const channel = supabase
      .channel(`task_status_${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `id=eq.${taskId}`
      }, (payload) => {
        const next = payload.new
        if (!isRecord(next) || !isActive.current) return
        const mapped = mapRowToTask(next, taskId)
        setLiveTask(mapped)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] Channel ${taskId} status: ${status}`)
        }
      })

    return () => {
      isActive.current = false
      supabase.removeChannel(channel)
    }
  }, [output?.taskId, output?.error, output?.status, recovered, supabase, fetchTask])

  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>{input?.taskId
            ? t("chat.tools.status.checkingFor", { id: input.taskId.slice(0, 8) })
            : t("chat.tools.status.checking")
          }</span>
        </div>
      )

    case 'output-available':
      if (output?.error && !recovered) {
        return (
          <div className="flex items-center gap-2 my-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span>{output.error}</span>
          </div>
        )
      }

      const effectiveOutput = liveTask || output
      const status = effectiveOutput?.status || 'unknown'
      const progress = effectiveOutput?.progress || 0
      const rawTitle = effectiveOutput?.video_title?.trim()
      const displayTitle = rawTitle && rawTitle.toLowerCase() !== 'unknown'
        ? rawTitle
        : effectiveOutput?.video_url
          ? (() => {
              try {
                return new URL(effectiveOutput.video_url).hostname
              } catch {
                return t("chat.tools.status.videoTask")
              }
            })()
          : t("chat.tools.status.videoTask")
      const planSteps = [
        {
          key: 'queued',
          label: t("chat.tools.status.steps.queuedLabel"),
          description: t("chat.tools.status.steps.queuedDesc"),
          minProgress: 0
        },
        {
          key: 'ingest',
          label: t("chat.tools.status.steps.ingestLabel"),
          description: t("chat.tools.status.steps.ingestDesc"),
          minProgress: 15
        },
        {
          key: 'transcribe',
          label: t("chat.tools.status.steps.transcribeLabel"),
          description: t("chat.tools.status.steps.transcribeDesc"),
          minProgress: 30
        },
        {
          key: 'summarize',
          label: t("chat.tools.status.steps.summarizeLabel"),
          description: t("chat.tools.status.steps.summarizeDesc"),
          minProgress: 70
        },
        {
          key: 'finalize',
          label: t("chat.tools.status.steps.finalizeLabel"),
          description: t("chat.tools.status.steps.finalizeDesc"),
          minProgress: 90
        }
      ]
      const resolvedProgress = status === 'completed' ? 100 : progress
      const activeStepIndex = status === 'failed'
        ? -1
        : planSteps.reduce((acc, step, idx) => (resolvedProgress >= step.minProgress ? idx : acc), 0)
      const completedCount = status === 'completed'
        ? planSteps.length
        : Math.max(activeStepIndex, 0)
      const progressValue = Math.round((completedCount / planSteps.length) * 100)

      return (
        <>
        <Card className={cn(
          "w-full max-w-full min-w-0 overflow-hidden my-3 border transition-all break-words",
          "bg-white/60 border-white/50 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)]",
          "dark:bg-zinc-900/60 dark:border-white/10 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)]"
        )}>
          {/* Content */}
          <div className="p-4 space-y-3 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 leading-snug text-slate-800 dark:text-slate-200 break-words">
              {displayTitle}
            </h3>

            {/* Status Indicator */}
            <div className="flex items-center gap-2 text-xs">
              {status === 'processing' && (
                <>
                  <Clock className="w-3 h-3 text-blue-500 animate-pulse" />
                  <span className="text-blue-500">{t("chat.tools.status.statusProcessing")}</span>
                </>
              )}
              {status === 'pending' && (
                <>
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-500">{t("chat.tools.status.statusQueued")}</span>
                </>
              )}
              {status === 'completed' && (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500">{t("chat.tools.status.statusReady")}</span>
                </>
              )}
              {status === 'failed' && (
                <>
                  <AlertCircle className="w-3 h-3 text-red-500" />
                  <span className="text-red-500">{t("chat.tools.status.statusFailed")}</span>
                </>
              )}
            </div>

            {/* Plan Steps */}
            <div className="rounded-md border border-white/40 bg-white/30 dark:border-white/10 dark:bg-white/5">
              <div className="px-3 py-2 border-b border-white/30 dark:border-white/10">
                <div className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{t("chat.tools.status.processingPlan")}</div>
                <div className="text-xs text-slate-500 dark:text-zinc-400">{t("chat.tools.status.processingPlanDesc")}</div>
                {status !== 'failed' && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-slate-500 dark:text-zinc-400">
                      {t("chat.tools.status.progressCount", { completed: completedCount, total: planSteps.length })}
                    </div>
                    <Progress value={progressValue} className="h-1 bg-slate-200/80 dark:bg-white/10" />
                  </div>
                )}
              </div>
              <div className="px-3 py-2">
                <div className="relative">
                  <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-200/70 dark:bg-white/10" />
                  <div className="space-y-3">
                    {planSteps.map((step, index) => {
                      const isDone = status === 'completed' || (activeStepIndex > index)
                      const isActive = status !== 'failed' && activeStepIndex === index && status !== 'completed'
                      const circleClassName = cn(
                        "relative z-10 w-5 h-5 rounded-full flex items-center justify-center border text-[10px] bg-white/90 dark:bg-black/40",
                        isDone && "bg-emerald-500 border-emerald-500 text-white",
                        isActive && "border-emerald-400 text-emerald-400",
                        !isDone && !isActive && "border-slate-300 text-slate-400 dark:border-white/15 dark:text-zinc-500"
                      )
                      const labelClassName = cn(
                        "text-xs",
                        isDone && "text-slate-800 dark:text-zinc-200",
                        isActive && "text-emerald-400",
                        !isDone && !isActive && "text-slate-500 dark:text-zinc-400"
                      )

                      return (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className={circleClassName}>
                            {isDone ? <CheckCircle className="w-3 h-3" /> : <span>{index + 1}</span>}
                          </div>
                          <div className="space-y-0.5">
                            <div className={labelClassName}>{step.label}</div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                              {step.description}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            {status === 'completed' && onViewClick && output?.taskId && (
              <Button
                onClick={() => onViewClick(output.taskId)}
                className="w-full h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t("chat.tools.status.viewSummary")}
              </Button>
            )}
          </div>
        </Card>
        {status === 'completed' && (
          <div className="mt-3 rounded-md border border-emerald-200/70 bg-emerald-50/70 p-3 text-xs text-emerald-900/90 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-100/90">
            <p>{t("chat.taskCompleteGuide.line1")}</p>
            <p className="mt-1">{t("chat.taskCompleteGuide.line2")}</p>
            <p className="mt-1">{t("chat.taskCompleteGuide.line3")}</p>
          </div>
        )}
      </>
      )

    case 'output-error':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span>{t("chat.tools.status.errorGetStatus")}: {errorText || t("chat.tools.status.unknownError")}</span>
        </div>
      )

    default:
      return null
  }
}
