'use client'

import {
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { UnknownToolProps } from './types'

export function UnknownTool({
  toolName,
  state,
}: UnknownToolProps) {
  const { t } = useI18n()

  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 my-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 px-3 py-2 rounded-md border border-slate-100 dark:border-white/5 w-fit">
          <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          <span className="font-medium">{t("chat.tools.unknown.running", { name: toolName })}</span>
        </div>
      )

    case 'output-available':
      return (
        <div className="flex items-center gap-2 my-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-100/50 dark:border-emerald-500/20 w-fit">
          <CheckCircle className="w-3 h-3" />
          <span className="font-medium">{t("chat.tools.unknown.completed", { name: toolName })}</span>
        </div>
      )

    case 'output-error':
      return (
        <div className="flex items-center gap-2 my-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-md border border-red-100 dark:border-red-900/20 w-fit">
          <AlertCircle className="w-3 h-3" />
          <span className="font-medium">{t("chat.tools.unknown.failed", { name: toolName })}</span>
        </div>
      )

    default:
      return null
  }
}
