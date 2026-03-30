'use client'

import { Card } from '@/components/ui/card'
import {
  AlertCircle,
  Play,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { PreviewVideoToolProps } from './types'

export function PreviewVideoTool({
  state,
  input,
  output,
  errorText
}: PreviewVideoToolProps) {
  const { t } = useI18n()
  // Robust fallback for URL display
  const displayUrl = input?.video_url || input?.videoUrl || input?.url;

  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-slate-500 dark:text-slate-400">
          <Search className="w-4 h-4 animate-pulse text-blue-500" />
          <span>{displayUrl ? (() => {
            try {
              return t("chat.tools.preview.fetchingFrom", { host: new URL(displayUrl).hostname });
            } catch {
              return t("chat.tools.preview.fetching") + '...';
            }
          })() : t("chat.tools.preview.fetching") + '...'}</span>
        </div>
      )

    case 'output-available':
      if (output?.error) {
        const previewErrorText = typeof output.error === 'string' ? output.error : JSON.stringify(output.error);
        return (
          <div className="flex items-center gap-2 my-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span>{previewErrorText}</span>
          </div>
        )
      }

      return (
        <Card className={cn(
          "w-full max-w-sm min-w-0 overflow-hidden my-3 border transition-all break-words",
          "bg-white/60 border-white/50 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)]",
          "dark:bg-zinc-900/60 dark:border-white/10 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)]"
        )}>
          {/* Thumbnail */}
          <div className="relative aspect-video bg-black/50">
            {output?.thumbnail ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamic external thumbnail URLs are rendered directly without Next image optimization */}
                <img
                  src={output.thumbnail}
                  alt={output.title || "Video"}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Play className="w-8 h-8 opacity-20" />
              </div>
            )}
            {output?.duration && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                {output.duration}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-2 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 leading-snug text-slate-800 dark:text-slate-200 break-words">
              {output?.title || t("chat.tools.preview.untitled")}
            </h3>
            {output?.channel && (
              <p className="text-xs text-muted-foreground">{output.channel}</p>
            )}
          </div>
        </Card>
      )

    case 'output-error':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span>{t("chat.tools.preview.errorPreview")}: {errorText || t("chat.tools.status.unknownError")}</span>
        </div>
      )

    default:
      return null
  }
}
