'use client'

import { Button } from '@/components/ui/button'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ExternalLink
} from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { CreateTaskToolProps } from './types'

export function CreateTaskTool({
  state,
  input,
  output,
  errorText,
  onViewClick
}: CreateTaskToolProps) {
  const { t } = useI18n()
  // Robust fallback for URL display
  const displayUrl = input?.video_url || input?.videoUrl || input?.url;

  switch (state) {
    case 'input-streaming':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
          <span>{t("chat.tools.create.preparing")}</span>
        </div>
      )

    case 'input-available':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-blue-500">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>{t("chat.tools.create.starting", { url: displayUrl?.slice(0, 40) || '' })}...</span>
        </div>
      )

    case 'output-available':
      if (output?.error) {
        // Handle details that might be an object (e.g., Pydantic validation errors)
        const detailsText = output.details
          ? (typeof output.details === 'string' ? output.details : JSON.stringify(output.details))
          : null;

        // If we have a specific error message, show it. Otherwise fall back to details or generic message.
        const errorMessage = output.error !== 'Failed to create task' ? output.error : null;

        return (
          <div className="my-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">{t("chat.tools.create.failed")}</span>
            </div>
            {errorMessage && (
              <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
            )}
            {detailsText && (
              <p className="mt-1 text-xs text-red-500">{detailsText}</p>
            )}
          </div>
        )
      }

      return (
        <div className="my-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">{output?.message || t("chat.tools.create.success")}</span>
          </div>
          {output?.videoUrl && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              {output.videoUrl}
            </p>
          )}
          {output?.taskId && onViewClick && (
            <Button
              onClick={() => onViewClick(output.taskId!)}
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              {t("chat.tools.create.viewProgress")}
            </Button>
          )}
        </div>
      )

    case 'output-error':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span>{t("chat.tools.create.errorCreate")}: {errorText || t("chat.tools.status.unknownError")}</span>
        </div>
      )

    default:
      return null
  }
}
