import { useRef, useEffect } from 'react'
import { UIMessage } from 'ai'

export function useChatScroll(deps: {
  messages: UIMessage[]
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

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight
    isUserNearBottomRef.current = distanceToBottom < 100 // 100px threshold
  }

  // Auto-scroll to bottom
  useEffect(() => {
    // Skip auto-scroll if showing Welcome Screen (no messages and no active task context)
    if (messages.length === 0 && !activeTaskId) return
    if (!scrollRef.current || !isUserNearBottomRef.current) return

    const el = scrollRef.current
    const isFirstScroll = !isInitializedRef.current
    if (isFirstScroll) isInitializedRef.current = true

    requestAnimationFrame(() => {
      if (!el) return
      if (isFirstScroll) {
        // Initial historical load: instant scroll to avoid multiple smooth-scroll animations
        el.style.scrollBehavior = 'auto'
        el.scrollTop = el.scrollHeight
        requestAnimationFrame(() => { el.style.scrollBehavior = '' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [messages, status, activeTaskId])

  return { scrollRef, handleScroll }
}
