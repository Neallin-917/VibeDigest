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
  input,
  output,
  errorText,
  onViewClick,
}: CreateTaskToolProps) {
  const { t } = useI18n()

  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-white/10 bg-zinc-950/70"
    >
      <ToolHeader
        type="tool-create_task"
        state={state}
        title="Processing"
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput
          output={
            output ? (
              <div className="space-y-3 text-sm">
                <div>{output.message || t('chat.tools.create.success')}</div>
                {output.videoUrl ? (
                  <div className="break-all text-xs text-zinc-400">{output.videoUrl}</div>
                ) : null}
                {output.taskId && onViewClick ? (
                  <Button
                    onClick={() => onViewClick(output.taskId!)}
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
          errorText={errorText ?? output?.error}
        />
      </ToolContent>
    </Tool>
  )
}
