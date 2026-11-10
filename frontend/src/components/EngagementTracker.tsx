'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function engagementEnabled() {
  return typeof window !== 'undefined'
    && ['vibedigest.io', 'www.vibedigest.io'].includes(window.location.hostname)
    && process.env.NEXT_PUBLIC_E2E_MOCK !== '1'
    && process.env.NEXT_PUBLIC_LOCAL_DEMO !== '1'
}

async function record(event: 'visit' | 'result_view' | 'engaged_read', taskId?: string) {
  try {
    const response = await fetch('/api/engagement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...(taskId ? { taskId } : {}) }), keepalive: true,
    })
    return response.ok
  } catch { return false }
}

// Server deduplicates visits per authenticated user/day. Do not cache across
// accounts or suppress a later authenticated visit after an anonymous response.
export function EngagementTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!engagementEnabled()) return
    const visit = () => { if (document.visibilityState === 'visible') void record('visit') }
    let midnight: ReturnType<typeof setTimeout>
    const nextDay = () => {
      const dayMs = 86_400_000
      midnight = setTimeout(() => { visit(); nextDay() }, dayMs - ((Date.now() + 8 * 3_600_000) % dayMs) + 50)
    }
    visit()
    nextDay()
    document.addEventListener('visibilitychange', visit)
    return () => { clearTimeout(midnight); document.removeEventListener('visibilitychange', visit) }
  }, [pathname])
  return null
}

export function ResultEngagement({ taskId, enabled, children, regions = false }: {
  taskId: string; enabled: boolean; children: ReactNode; regions?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || !engagementEnabled() || !ref.current || !('IntersectionObserver' in window)) return
    let intersecting = false
    let accumulated = 0
    let started: number | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let viewed = false
    let read = false
    let pendingView = false
    let pendingRead = false
    let disposed = false
    const send = () => {
      if (!viewed && !pendingView) {
        pendingView = true
        void record('result_view', taskId).then(ok => {
          viewed = ok; pendingView = false
          if (ok && !disposed) send()
        })
      }
      if (viewed && accumulated >= 20_000 && !read && !pendingRead) {
        pendingRead = true
        void record('engaged_read', taskId).then(ok => { read = ok; pendingRead = false })
      }
    }
    const update = () => {
      if (disposed) return
      if (started !== null) accumulated += performance.now() - started
      started = null
      clearTimeout(timer)
      if (intersecting && document.visibilityState === 'visible') {
        send()
        if (!read && accumulated < 20_000) {
          started = performance.now()
          timer = setTimeout(update, 20_000 - accumulated)
        }
      }
    }
    const visible = new Set<Element>()
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      intersecting = visible.size > 0
      update()
    }, { threshold: 0 })
    if (regions) ref.current.querySelectorAll('[data-engagement-region]').forEach(node => observer.observe(node))
    else observer.observe(ref.current)
    document.addEventListener('visibilitychange', update)
    return () => {
      disposed = true
      observer.disconnect()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [taskId, enabled, regions])
  return <div ref={ref} className={regions ? "contents" : "space-y-3"}>{children}</div>
}
