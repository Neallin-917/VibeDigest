"use client"

import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/components/i18n/I18nProvider"

interface ThreadActionMenuProps {
  threadTitle: string
  status: 'active' | 'archived'
  onUpdateStatus?: (status: 'active' | 'archived') => void | Promise<void>
}

export function ThreadActionMenu({
  threadTitle,
  status,
  onUpdateStatus,
}: ThreadActionMenuProps) {
  const { t } = useI18n()
  const isArchived = status === 'archived'
  const nextStatus = isArchived ? 'active' : 'archived'
  const actionLabel = isArchived
    ? (t('chat.restore') || 'Restore chat')
    : (t('chat.archive') || 'Archive chat')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open thread actions for ${threadTitle}`}
          className="shrink-0 rounded-lg p-2 text-foreground-subtle transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem
          onClick={() => {
            void onUpdateStatus?.(nextStatus)
          }}
          className="cursor-pointer"
          aria-label={actionLabel}
        >
          {isArchived ? (
            <ArchiveRestore className="mr-2 h-4 w-4" />
          ) : (
            <Archive className="mr-2 h-4 w-4" />
          )}
          {actionLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
