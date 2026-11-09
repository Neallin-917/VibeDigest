"use client"

import { RailToc, type RailTocItem } from "@/components/ui/rare/rail-toc"
import styles from "./task-reading.module.css"

/** Public task details scroll the document, rather than the authenticated chat shell. */
export function TaskReadingNav({ items, title }: { items: RailTocItem[]; title: string }) {
  return (
    <aside className={styles.navigation}>
      <div className={styles.desktopNavigation}>
        <RailToc items={items} title={title} offset={128} className="!w-full text-xs" />
      </div>
      <nav className={styles.mobileNavigation} aria-label={title}>
        {items.filter(item => !item.depth).map(item => (
          <a key={item.id} href={`#${item.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  )
}
