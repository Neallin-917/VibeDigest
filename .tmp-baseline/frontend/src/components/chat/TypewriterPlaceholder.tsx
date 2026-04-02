'use client'

import { useState, useEffect, useCallback } from 'react'
import { EXAMPLE_URLS, TYPEWRITER_CONFIG } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface TypewriterPlaceholderProps {
  /** Whether the placeholder should be visible (hidden when user types) */
  visible?: boolean
  /** Additional className for the container */
  className?: string
}

type Phase = 'typing' | 'pausing' | 'deleting' | 'waiting'

export function TypewriterPlaceholder({
  visible = true,
  className
}: TypewriterPlaceholderProps) {
  const [displayText, setDisplayText] = useState('')
  const [urlIndex, setUrlIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')

  const currentUrl = EXAMPLE_URLS[urlIndex]

  const advanceToNextUrl = useCallback(() => {
    setUrlIndex((prev) => (prev + 1) % EXAMPLE_URLS.length)
  }, [])

  // Animation loop: This pattern is intentional for typewriter effect state machine
  useEffect(() => {
    if (!visible) return

    let timeoutId: NodeJS.Timeout

    switch (phase) {
      case 'typing':
        if (displayText.length < currentUrl.length) {
          timeoutId = setTimeout(() => {
            setDisplayText(currentUrl.slice(0, displayText.length + 1))
          }, TYPEWRITER_CONFIG.typingSpeed)
        } else {
          // Finished typing, pause before deleting
          timeoutId = setTimeout(() => setPhase('pausing'), 0)
        }
        break

      case 'pausing':
        timeoutId = setTimeout(() => {
          setPhase('deleting')
        }, TYPEWRITER_CONFIG.pauseAfterTyping)
        break

      case 'deleting':
        if (displayText.length > 0) {
          timeoutId = setTimeout(() => {
            setDisplayText(displayText.slice(0, -1))
          }, TYPEWRITER_CONFIG.deletingSpeed)
        } else {
          // Finished deleting, wait before typing next
          timeoutId = setTimeout(() => setPhase('waiting'), 0)
        }
        break

      case 'waiting':
        timeoutId = setTimeout(() => {
          advanceToNextUrl()
          setPhase('typing')
        }, TYPEWRITER_CONFIG.pauseAfterDeleting)
        break
    }

    return () => clearTimeout(timeoutId)
  }, [phase, displayText, currentUrl, visible, advanceToNextUrl])

  // Reset animation when visibility changes
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayText('')
      setPhase('typing')
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center pointer-events-none select-none",
        "pl-0", // Aligned with input text
        className
      )}
      aria-hidden="true"
    >
      <span className="text-slate-400/80 dark:text-zinc-500 text-[15px] font-medium tracking-wide truncate">
        {displayText}
        <span
          className={cn(
            "inline-block w-0.5 h-4 md:h-5 ml-0.5 bg-slate-400 dark:bg-zinc-500 align-middle",
            "animate-pulse"
          )}
        />
      </span>
    </div>
  )
}
