'use client'

import { ThinkingOrb } from 'thinking-orbs'
import { cn } from '@/lib/utils'

type ProcessingIndicatorSize = 'inline' | 'panel'

interface ProcessingIndicatorProps {
  /** A short, localized description of the current work. */
  label: string
  size?: ProcessingIndicatorSize
  className?: string
}

const orbSizes: Record<ProcessingIndicatorSize, 20 | 64> = {
  inline: 20,
  panel: 64,
}

/**
 * Product-facing boundary for the canvas-based thinking-orbs dependency.
 *
 * The orb is deliberately decorative: the visible status text is the only
 * announcement exposed to assistive technology. thinking-orbs handles theme
 * changes and renders a static frame for `prefers-reduced-motion` internally.
 */
export function ProcessingIndicator({
  label,
  size = 'inline',
  className,
}: ProcessingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2', className)}
      data-testid="processing-indicator"
    >
      <span aria-hidden="true" className="shrink-0 leading-none">
        <ThinkingOrb
          state="working"
          size={orbSizes[size]}
          theme="auto"
          aria-hidden="true"
        />
      </span>
      <span>{label}</span>
    </div>
  )
}
