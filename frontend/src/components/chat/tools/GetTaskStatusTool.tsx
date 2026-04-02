'use client'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@/components/ai-elements/tool'
import type { GetTaskStatusToolProps } from './types'
import { useI18n } from '@/components/i18n/I18nProvider'

export function GetTaskStatusTool({
  state,
  output,
  errorText,
}: GetTaskStatusToolProps) {
  const { t } = useI18n()

  const statusLabel =
    output?.status === 'completed'
      ? t('chat.tools.status.statusReady')
      : output?.status === 'failed'
        ? t('chat.tools.status.statusFailed')
        : output?.status === 'processing'
          ? t('chat.tools.status.statusProcessing')
          : t('chat.tools.status.statusQueued')

  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-white/10 bg-zinc-950/70"
    >
      <ToolHeader
        type="tool-get_task_status"
        state={state}
        title="Task status"
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput
          output={
            output
              ? (
                  <div className="space-y-2 text-sm">
                    <div>Latest status: {statusLabel}</div>
                    <div className="text-xs text-zinc-400">taskId: {output.taskId}</div>
                  </div>
                )
              : undefined
          }
          errorText={errorText ?? output?.error}
        />
      </ToolContent>
    </Tool>
  )
}
