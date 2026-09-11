import Link from "next/link"
import { cva } from "class-variance-authority"
import type { Locale } from "@/lib/i18n"
import { TOPIC_ROUTE_ORDER, getTopicHubCopy } from "@/lib/topic-hubs"
import { buildLibraryHref } from "@/lib/library-navigation"
import { cn } from "@/lib/utils"

const linkVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
  {
    variants: {
      tone: {
        subtle:
          "border-border text-foreground/80 hover:border-primary/50 hover:text-foreground",
        strong:
          "border-primary/25 bg-primary/5 text-primary-strong hover:border-primary/45 hover:bg-primary/10",
      },
    },
    defaultVariants: {
      tone: "subtle",
    },
  },
)

export function TopicHubLinks({
  locale,
  title,
  className,
  tone = "subtle",
  compact = false,
  activePath,
  query = "",
  onNavigate,
}: {
  locale: Locale
  title: string
  className?: string
  tone?: "subtle" | "strong"
  compact?: boolean
  activePath?: string
  query?: string
  onNavigate?: (href: string) => void
}) {
  return (
    <nav className={cn(!compact && "space-y-3", className)} aria-labelledby="topic-hub-links-title">
      <h2 id="topic-hub-links-title" className={cn("text-sm font-semibold text-foreground", compact && "sr-only")}>
        {title}
      </h2>
      <div className={cn("flex gap-2", compact ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex-wrap gap-3")}>
        {compact ? (
          <Link
            href={buildLibraryHref(`/${locale}/explore`, "all", query, 1)}
            onNavigate={onNavigate ? () => onNavigate(buildLibraryHref(`/${locale}/explore`, "all", query, 1)) : undefined}
            aria-current={activePath === `/${locale}/explore` ? "page" : undefined}
            className={cn(linkVariants({ tone }), activePath === `/${locale}/explore` && "border-primary bg-surface-tint text-primary-strong")}
          >
            {locale === "zh" ? "全部主题" : "All topics"}
          </Link>
        ) : null}
        {TOPIC_ROUTE_ORDER.map((topic) => {
          const hub = getTopicHubCopy(locale, topic)
          return (
            <Link
              key={topic}
              href={buildLibraryHref(`/${locale}/topics/${hub.slug}`, "all", query, 1)}
              onNavigate={onNavigate ? () => onNavigate(buildLibraryHref(`/${locale}/topics/${hub.slug}`, "all", query, 1)) : undefined}
              aria-current={activePath === `/${locale}/topics/${hub.slug}` ? "page" : undefined}
              className={cn(linkVariants({ tone }), activePath === `/${locale}/topics/${hub.slug}` && "border-primary bg-surface-tint text-primary-strong")}
            >
              {hub.shortLabel}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
