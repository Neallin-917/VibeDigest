import { useRef, useEffect, useLayoutEffect } from 'react'
import type { ChatUIMessage } from '@/lib/chat-ui'

export function useChatScroll(deps: {
  messages: ChatUIMessage[]
  status: string
  activeTaskId?: string | null
}): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  handleScroll: () => void
} {
  const { messages, status, activeTaskId } = deps

  const scrollRef = useRef<HTMLDivElement>(null)
  const isUserNearBottomRef = useRef(true)
  const isInitializedRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)
  const digestTaskRef = useRef<string | null>(null)
  const isDigestOnly = Boolean(activeTaskId) && messages.length === 1
    && messages[0].role === 'assistant' && messages[0].parts.length > 0
    && messages[0].parts.every(part => part.type === 'data-task-status' && part.data.status === 'completed')

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight
    isUserNearBottomRef.current = distanceToBottom < 100 // 100px threshold
  }

  // Auto-scroll to bottom
  useLayoutEffect(() => {
    // Skip auto-scroll if showing Welcome Screen (no messages and no active task context)
    if (messages.length === 0 && !activeTaskId) return
    if (!scrollRef.current) return

    const el = scrollRef.current
    if (isDigestOnly) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      // An existing digest opens as a document, before the first follow-up.
      if (digestTaskRef.current !== activeTaskId) el.scrollTop = 0
      digestTaskRef.current = activeTaskId ?? null
      return
    }
    if (digestTaskRef.current !== null) {
      digestTaskRef.current = null
      isUserNearBottomRef.current = true
    }
    if (!isUserNearBottomRef.current) return

    const isFirstScroll = !isInitializedRef.current
    if (isFirstScroll) isInitializedRef.current = true

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      if (!el) return
      if (isFirstScroll) {
        // Initial historical load: instant scroll to avoid multiple smooth-scroll animations
        el.style.scrollBehavior = 'auto'
        el.scrollTop = el.scrollHeight
        requestAnimationFrame(() => { el.style.scrollBehavior = '' })
      } else {
        el.scrollTop = el.scrollHeight
      }
      rafIdRef.current = null
    })
  }, [messages, status, activeTaskId, isDigestOnly])

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  return { scrollRef, handleScroll }
}
