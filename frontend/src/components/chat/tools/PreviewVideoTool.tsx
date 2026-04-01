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
  input,
  output,
  errorText,
}: PreviewVideoToolProps) {
  const { t } = useI18n()

  return (
    <Tool
      defaultOpen={state === 'output-available' || state === 'output-error'}
      className="mb-0 overflow-hidden border-white/10 bg-zinc-950/70"
    >
      <ToolHeader
        type="tool-preview_video"
        state={state}
        title="Video preview"
        className="text-zinc-100"
      />
      <ToolContent className="border-t border-white/10 bg-transparent text-zinc-200">
        <ToolOutput
          output={
            output ? (
              <div className="space-y-3">
                {output.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic external thumbnail URLs are rendered directly without Next image optimization
                  <img
                    src={output.thumbnail}
                    alt={output.title || 'Video'}
                    className="aspect-video w-full rounded-md object-cover"
                  />
                ) : null}
                <div className="space-y-1 text-sm">
                  <div>{output.title || t('chat.tools.preview.untitled')}</div>
                  {output.channel ? (
                    <div className="text-xs text-zinc-400">{output.channel}</div>
                  ) : null}
                  {output.duration ? (
                    <div className="text-xs text-zinc-400">{output.duration}</div>
                  ) : null}
                </div>
              </div>
            ) : undefined
          }
          errorText={errorText ?? output?.error}
        />
      </ToolContent>
    </Tool>
  )
}
