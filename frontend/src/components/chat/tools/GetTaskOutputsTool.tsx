'use client'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { GetTaskOutputsToolProps } from './types'

export function GetTaskOutputsTool({
  state,
  output,
  errorText,
}: GetTaskOutputsToolProps) {
  const { t } = useI18n()

  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-border bg-surface-raised shadow-sm"
    >
      <ToolHeader
        type="tool-get_task_outputs"
        state={state}
        title="Retrieved results"
        className="text-foreground"
      />
      <ToolContent className="border-t border-border bg-transparent text-foreground">
        <ToolOutput
          output={
            output ? (
              <div className="space-y-2 text-sm">
                <div>{t('chat.tools.outputs.retrieved', { count: output.count || 0 })}</div>
                {output.outputs?.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {output.outputs.map(item => (
                      <li key={`${item.kind}-${item.status}`}>{item.kind}</li>
                    ))}
                  </ul>
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
