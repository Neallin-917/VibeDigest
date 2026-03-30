'use client'

import {
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { GetTaskOutputsToolProps } from './types'

export function GetTaskOutputsTool({
  state,
  input,
  output,
  errorText
}: GetTaskOutputsToolProps) {
  const { t } = useI18n()

  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-slate-500 dark:text-slate-400">
          <FileText className="w-4 h-4 animate-pulse text-blue-500" />
          <span>{t("chat.tools.outputs.retrieving")}{input?.kinds ? ` (${input.kinds.join(', ')})` : ''}...</span>
        </div>
      )

    case 'output-available':
      if (output?.error) {
        return (
          <div className="flex items-center gap-2 my-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span>{output.error}</span>
          </div>
        )
      }

      return (
        <div className="my-2 text-sm text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>{t("chat.tools.outputs.retrieved", { count: output?.count || 0 })}</span>
          </div>
        </div>
      )

    case 'output-error':
      return (
        <div className="flex items-center gap-2 my-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span>{t("chat.tools.outputs.errorOutputs")}: {errorText || t("chat.tools.status.unknownError")}</span>
        </div>
      )

    default:
      return null
  }
}
