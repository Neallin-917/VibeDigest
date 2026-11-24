'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n'

const copy = {
  en: { en: 'Preparing the English digest…', zh: 'Preparing the Chinese digest…', unavailable: 'This version is currently unavailable.' },
  zh: { en: '正在准备英文版…', zh: '正在准备中文版…', unavailable: '这个语言版本暂时无法提供。' },
}

/** Start only after a private detail page is opened. Realtime handles subsequent changes. */
export function TaskSummaryVersionStatus({ taskId, locale, target, status, onCompleted }: {
  taskId: string
  locale: Locale
  target: Locale
  onCompleted?: () => void
  status: 'request' | 'waiting' | 'unavailable'
}) {
  const router = useRouter()
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (status !== 'request') return
    let active = true
    async function requestVersion() {
      try {
        const response = await fetch(`/api/tasks/${taskId}/summary-version`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: target }),
        })
        if (!response.ok) throw new Error()
        const result = await response.json()
        if (!active) return
        if (result.status === 'completed') {
          if (onCompleted) onCompleted()
          else router.refresh()
        }
        setUnavailable(!['pending', 'processing', 'completed'].includes(result.status))
      } catch {
        if (active) setUnavailable(true)
      }
    }
    void requestVersion()
    return () => { active = false }
  }, [onCompleted, router, status, target, taskId])

  return <p role="status" className="text-sm text-muted-foreground">{
    status === 'unavailable' || (status === 'request' && unavailable)
      ? copy[locale].unavailable : copy[locale][target]
  }</p>
}
