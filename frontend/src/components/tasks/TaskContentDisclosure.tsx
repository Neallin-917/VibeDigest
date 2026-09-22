"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Keep short content readable; constrain only sections that exceed their line budget. */
export function TaskContentDisclosure({ children, maxLines, moreLabel, lessLabel, className }: {
    children: ReactNode
    maxLines: number
    moreLabel: string
    lessLabel: string
    className?: string
}) {
    const contentRef = useRef<HTMLDivElement>(null)
    const contentId = useId()
    const [maxHeight, setMaxHeight] = useState<number | null>(null)
    const [expanded, setExpanded] = useState(false)
    const collapsed = maxHeight !== null && !expanded

    useEffect(() => {
        const content = contentRef.current
        if (!content) return
        const measure = () => {
            const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight)
            const limit = lineHeight * maxLines
            const height = content.getBoundingClientRect().height
            setMaxHeight(Number.isFinite(limit) && height > limit + 1 ? limit : null)
        }
        measure()
        // Observe the unconstrained inner content, so resizing also works while collapsed.
        const observer = new ResizeObserver(measure)
        observer.observe(content)
        return () => observer.disconnect()
    }, [maxLines])

    return (
        <div>
            <div
                id={contentId}
                style={collapsed ? { maxHeight: maxHeight!, overflow: "hidden" } : undefined}
                onFocusCapture={() => {
                    // Keyboard navigation must never leave a source link hidden by clipping.
                    if (collapsed) setExpanded(true)
                }}
            >
                <div ref={contentRef} className={cn("flow-root leading-6", className)}>{children}</div>
            </div>
            {maxHeight !== null && (
                <button
                    type="button"
                    aria-expanded={!collapsed}
                    aria-controls={contentId}
                    onClick={() => setExpanded(!expanded)}
                    className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    {collapsed ? moreLabel : lessLabel}
                    <ChevronDown className={cn("size-3.5", !collapsed && "rotate-180")} aria-hidden="true" />
                </button>
            )}
        </div>
    )
}
