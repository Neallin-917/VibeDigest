'use client'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { PreviewVideoToolProps } from './types'

export function PreviewVideoTool({
  state,
  output,
  errorText,
}: PreviewVideoToolProps) {
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
        type="tool-preview_video"
        state={displayState}
        title="Video preview"
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput
          output={
            successfulOutput ? (
              <div className="space-y-3">
                {successfulOutput.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic external thumbnail URLs are rendered directly without Next image optimization
                  <img
                    src={successfulOutput.thumbnail}
                    alt={successfulOutput.title || 'Video'}
                    className="aspect-video w-full rounded-md object-cover"
                  />
                ) : null}
                <div className="space-y-1 text-sm">
                  <div>{successfulOutput.title || t('chat.tools.preview.untitled')}</div>
                  {successfulOutput.channel ? (
                    <div className="text-xs text-zinc-400">{successfulOutput.channel}</div>
                  ) : null}
                  {successfulOutput.duration ? (
                    <div className="text-xs text-zinc-400">{successfulOutput.duration}</div>
                  ) : null}
                </div>
              </div>
            ) : undefined
          }
          errorText={resolvedError}
        />
      </ToolContent>
    </Tool>
  )
}
