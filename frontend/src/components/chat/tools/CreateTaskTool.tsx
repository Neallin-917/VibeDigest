'use client'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { CreateTaskToolProps } from './types'

export function CreateTaskTool({
  state,
  output,
  errorText,
  onViewClick,
}: CreateTaskToolProps) {
  const { t } = useI18n()
  const resolvedError = errorText ?? output?.error
  const displayState = resolvedError ? 'output-error' : state
  const successfulOutput = output && !resolvedError ? output : undefined

  return (
    <Tool
      defaultOpen={displayState === 'output-available' || displayState === 'output-error'}
      className="mb-0 overflow-hidden border-white/10 bg-zinc-950/70"
    >
      <ToolHeader
        type="tool-create_task"
        state={displayState}
        title="Processing"
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput
          output={
            successfulOutput ? (
              <div className="space-y-3 text-sm">
                <div>{successfulOutput.message || t('chat.tools.create.success')}</div>
                {successfulOutput.videoUrl ? (
                  <div className="break-all text-xs text-zinc-400">{successfulOutput.videoUrl}</div>
                ) : null}
                {successfulOutput.taskId && onViewClick ? (
                  <Button
                    onClick={() => onViewClick(successfulOutput.taskId!)}
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/10 bg-transparent text-xs text-zinc-200 hover:bg-white/5"
                  >
                    <ExternalLink className="mr-1 size-3" />
                    {t('chat.tools.create.viewProgress')}
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
          errorText={resolvedError}
        />
      </ToolContent>
    </Tool>
  )
}
