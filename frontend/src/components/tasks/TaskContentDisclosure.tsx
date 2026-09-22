"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** Static task prose only: the inert copy measures wrapping while native details is closed. */
export function TaskContentDisclosure({ children, preview, maxLines, moreLabel, lessLabel, className }: {
    children: ReactNode
    preview: string
    maxLines: number
    moreLabel: string
    lessLabel: string
    className?: string
}) {
    const contentRef = useRef<HTMLDivElement>(null)
    const [overflows, setOverflows] = useState<boolean | null>(null)
    const [expanded, setExpanded] = useState(false)
    const open = overflows === false || expanded
    const contentClass = cn("flow-root leading-6", className)
    // A real excerpt, not a visually clipped copy of the full accessible body.
    const characters = Array.from(preview)
    const excerpt = characters.length > 96 ? `${characters.slice(0, 96).join("").trimEnd()}…` : preview

    useLayoutEffect(() => {
        const content = contentRef.current
        if (!content) return
        const measure = () => {
            // Markdown prose can override the wrapper's line height at breakpoints.
            const paragraph = content.querySelector("p") ?? content
            const lineHeight = Number.parseFloat(getComputedStyle(paragraph).lineHeight)
            const limit = lineHeight * maxLines
            setOverflows(Number.isFinite(limit) && content.getBoundingClientRect().height > limit + 1)
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(content)
        return () => observer.disconnect()
    }, [maxLines])

    return (
        <div className="relative">
            <div aria-hidden="true" inert className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
                <div ref={contentRef} className={contentClass}>{children}</div>
            </div>
            <details className="group/disclosure" open={open}>
                <summary
                    hidden={overflows === false}
                    role="button"
                    aria-label={overflows === null ? undefined : open ? lessLabel : moreLabel}
                    aria-expanded={overflows === null ? undefined : open}
                    onClick={(event) => {
                        event.preventDefault()
                        setExpanded(!expanded)
                    }}
                    className="cursor-pointer list-none rounded-sm marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden"
                >
                    <span className={cn("block group-open/disclosure:hidden", className)}>{excerpt}</span>
                    <span className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary">
                        <span className="group-open/disclosure:hidden">{moreLabel}</span>
                        <span className="hidden group-open/disclosure:inline">{lessLabel}</span>
                        <ChevronDown className="size-3.5 group-open/disclosure:rotate-180" aria-hidden="true" />
                    </span>
                </summary>
                <div className={contentClass}>{children}</div>
            </details>
        </div>
    )
}
