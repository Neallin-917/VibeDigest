import Link from "next/link"
import { cva } from "class-variance-authority"
import type { Locale } from "@/lib/i18n"
import { TOPIC_ROUTE_ORDER, getTopicHubCopy } from "@/lib/topic-hubs"
import { cn } from "@/lib/utils"

const linkVariants = cva(
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
  {
    variants: {
      tone: {
        subtle:
          "border-border text-foreground/80 hover:border-emerald-500/50 hover:text-foreground",
        strong:
          "border-emerald-600/25 bg-emerald-500/5 text-emerald-800 hover:border-emerald-600/45 hover:bg-emerald-500/10 dark:text-emerald-200",
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
}: {
  locale: Locale
  title: string
  className?: string
  tone?: "subtle" | "strong"
}) {
  return (
    <section className={cn("space-y-3", className)} aria-labelledby="topic-hub-links-title">
      <h2 id="topic-hub-links-title" className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap gap-3">
        {TOPIC_ROUTE_ORDER.map((topic) => {
          const hub = getTopicHubCopy(locale, topic)
          return (
            <Link
              key={topic}
              href={`/${locale}/topics/${hub.slug}`}
              className={linkVariants({ tone })}
            >
              {hub.shortLabel}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
