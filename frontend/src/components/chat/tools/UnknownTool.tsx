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
  input,
  output,
  errorText,
}: UnknownToolProps) {
  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-white/10 bg-zinc-950/70"
    >
      <ToolHeader
        type="dynamic-tool"
        state={state}
        toolName={toolName}
        title={toolName}
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput output={output} errorText={errorText} />
      </ToolContent>
    </Tool>
  )
}
