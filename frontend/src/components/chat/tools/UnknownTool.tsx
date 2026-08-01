'use client'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@/components/ai-elements/tool'
import type { UnknownToolProps } from './types'

export function UnknownTool({
  toolName,
  state,
  output,
  errorText,
}: UnknownToolProps) {
  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-border bg-surface-raised shadow-sm"
    >
      <ToolHeader
        type="dynamic-tool"
        state={state}
        toolName={toolName}
        title={toolName}
        className="text-foreground"
      />
      <ToolContent className="border-t border-border bg-transparent text-foreground">
        <ToolOutput output={output} errorText={errorText} />
      </ToolContent>
    </Tool>
  )
}
