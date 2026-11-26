'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/i18n'

const copy = {
  en: {
    en: 'Preparing the English digest…', zh: 'Preparing the Chinese digest…', unavailable: 'This version is currently unavailable.',
    failed: { en: 'Couldn’t check the English digest.', zh: 'Couldn’t check the Chinese digest.' },
    checking: 'Checking this version…', recheck: 'Check again',
  },
  zh: {
    en: '正在准备英文版…', zh: '正在准备中文版…', unavailable: '这个语言版本暂时无法提供。',
    failed: { en: '暂时无法确认英文版。', zh: '暂时无法确认中文版。' },
    checking: '正在检查此版本…', recheck: '重新检查',
  },
}

/** Start only after a private detail page is opened. Realtime handles subsequent changes. */
export function TaskSummaryVersionStatus({ taskId, locale, target, status, recheck, onRecheck, onCompleted }: {
  taskId: string
  locale: Locale
  target: Locale
  recheck?: 'failed' | 'rechecking'
  onRecheck?: () => void
  onCompleted?: () => void
  status: 'request' | 'waiting' | 'unavailable' | null
}) {
  // A refresh may temporarily withdraw confirmation. Keep the last decision for
  // this mounted task and locale so an existing request is not started again.
  const [confirmedStatus, setConfirmedStatus] = useState(status)
  if (status && status !== confirmedStatus) setConfirmedStatus(status)
  const router = useRouter()
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (confirmedStatus !== 'request') return
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
  }, [confirmedStatus, onCompleted, router, target, taskId])

  if (!confirmedStatus) {
    if (!recheck || !onRecheck) return null
    const checking = recheck === 'rechecking'
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <p role="status">{checking ? copy[locale].checking : copy[locale].failed[target]}</p>
        <Button type="button" variant="link" size="sm" className="min-h-11 px-2" aria-disabled={checking}
          onClick={() => { if (!checking) onRecheck() }}>
          {copy[locale].recheck}
        </Button>
      </div>
    )
  }
  return <p role="status" className="text-sm text-muted-foreground">{
    confirmedStatus === 'unavailable' || (confirmedStatus === 'request' && unavailable)
      ? copy[locale].unavailable : copy[locale][target]
  }</p>
}
