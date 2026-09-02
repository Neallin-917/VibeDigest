'use client'

import { memo, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  MessageSquarePlus,
  Library,
  MessageSquare,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { useProgressiveThreadList } from '@/hooks/useProgressiveThreadList'
import type { Thread } from '@/types'
import { ThreadActionMenu } from '@/components/layout/sidebar/ThreadActionMenu'

interface MobileMenuDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onNewChat: () => void
  onOpenLibrary: () => void
  threads?: Thread[]
  activeThreadId?: string | null
  selectedThreadId?: string | null
  onSelectThread?: (threadId: string) => void
  onPrefetchThread?: (threadId: string) => void
  onUpdateThreadStatus?: (threadId: string, status: 'active' | 'archived') => void | Promise<void>
}

function MobileMenuDrawerComponent({ 
  isOpen, 
  onOpenChange, 
  onNewChat, 
  onOpenLibrary,
  threads = [],
  activeThreadId,
  selectedThreadId,
  onSelectThread,
  onPrefetchThread,
  onUpdateThreadStatus
}: MobileMenuDrawerProps) {
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Collapse state
  const [isChatsOpen, setIsChatsOpen] = useState(true)
  const [isArchivedOpen, setIsArchivedOpen] = useState(false)

  const currentSelectedThreadId = selectedThreadId ?? activeThreadId
  const isNewChatActive = pathname?.endsWith('/chat') && !searchParams?.get('task') && !currentSelectedThreadId
  const isCommunityActive = pathname?.includes('/explore')
  const activeThreads = useMemo(
    () => threads.filter((thread) => thread.status !== 'archived'),
    [threads]
  )
  const archivedThreads = useMemo(
    () => threads.filter((thread) => thread.status === 'archived'),
    [threads]
  )
  const isSelectedThreadArchived = archivedThreads.some((thread) => thread.id === currentSelectedThreadId)
  const shouldShowArchivedThreads = isArchivedOpen || isSelectedThreadArchived
  const {
    visibleThreads: visibleActiveThreads,
    hasMore: hasMoreActiveThreads,
    loadMore: loadMoreActiveThreads,
  } = useProgressiveThreadList(activeThreads, currentSelectedThreadId)
  const {
    visibleThreads: visibleArchivedThreads,
    hasMore: hasMoreArchivedThreads,
    loadMore: loadMoreArchivedThreads,
  } = useProgressiveThreadList(archivedThreads, currentSelectedThreadId)
  
  const handleNewChat = () => {
    onOpenChange(false)
    onNewChat()
  }

  const handleCommunityClick = () => {
    onOpenChange(false)
    onOpenLibrary() // This prop was named onOpenLibrary but effectively handles navigation/action
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          "w-[280px] p-0 flex flex-col border-r shadow-2xl backdrop-blur-xl",
          "border-sidebar-border/80 bg-sidebar/95"
        )}
      >
        {/* Header */}
        <SheetHeader className="border-b border-sidebar-border/80 p-5">
          <SheetTitle asChild>
            <Link
              href={`/${locale}`}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2.5"
              aria-label="Go to home"
            >
              <BrandLogo showText={true} />
            </Link>
          </SheetTitle>
        </SheetHeader>

        {/* Menu Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {/* New Chat */}
          <MenuButton
            icon={MessageSquarePlus}
            label={t('chat.newChat') || 'New Chat'}
            onClick={handleNewChat}
            isActive={isNewChatActive}
          />

          {/* Community (formerly Library) - Aligned with Desktop */}
          <MenuButton
            icon={Library}
            label={t('chat.community') || 'Community'}
            onClick={handleCommunityClick}
            isActive={isCommunityActive}
          />

          <div className="my-3 h-px bg-sidebar-border/70" />

          {/* Chats Section */}
          <div className="mb-2">
            <button
              onClick={() => setIsChatsOpen(!isChatsOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-xl w-full text-left",
                "text-foreground-subtle hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              {isChatsOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span className="uppercase tracking-wider text-xs">{t("chat.chats") || "Chats"}</span>
            </button>
            
            {isChatsOpen && (
              <div className="space-y-0.5 mt-1">
                {activeThreads.length === 0 ? (
                   <div className="px-3 py-2 text-xs text-foreground-subtle">
                    {archivedThreads.length === 0 ? t('chat.noChats') : t('chat.noActiveChats')}
                  </div>
                ) : (
                  visibleActiveThreads.map(thread => (
                    <MobileThreadListItem
                      key={thread.id}
                      thread={thread}
                      defaultTitle={t('chat.newChat')}
                      isSelected={currentSelectedThreadId === thread.id}
                      onSelectThread={onSelectThread}
                      onPrefetchThread={onPrefetchThread}
                      onUpdateThreadStatus={onUpdateThreadStatus}
                    />
                  ))
                )}

                {hasMoreActiveThreads ? (
                  <button
                    type="button"
                    onClick={loadMoreActiveThreads}
                    className="w-full rounded-xl px-3 py-2 text-sm text-foreground-subtle transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  >
                    {t('chat.loadMore')}
                  </button>
                ) : null}

                {archivedThreads.length > 0 ? (
                  <div className="pt-3">
                    <button
                      type="button"
                      aria-label="Toggle archived chats"
                      onClick={() => setIsArchivedOpen((open) => !open)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-xl w-full text-left",
                        "text-foreground-subtle hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {shouldShowArchivedThreads ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="uppercase tracking-wider text-xs">{t("chat.archived") || "Archived"}</span>
                    </button>

                    {shouldShowArchivedThreads ? (
                      <div className="space-y-0.5 mt-1">
                        {visibleArchivedThreads.map((thread) => (
                          <MobileThreadListItem
                            key={thread.id}
                            thread={thread}
                            defaultTitle={t('chat.newChat')}
                            isSelected={currentSelectedThreadId === thread.id}
                            onSelectThread={onSelectThread}
                            onPrefetchThread={onPrefetchThread}
                            onUpdateThreadStatus={onUpdateThreadStatus}
                          />
                        ))}
                        {hasMoreArchivedThreads ? (
                          <button
                            type="button"
                            onClick={loadMoreArchivedThreads}
                            className="w-full rounded-xl px-3 py-2 text-sm text-foreground-subtle transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                          >
                            {t('chat.loadMore')}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

        </nav>

      </SheetContent>
    </Sheet>
  )
}

export const MobileMenuDrawer = memo(MobileMenuDrawerComponent)

function MobileThreadListItem({
  thread,
  defaultTitle,
  isSelected,
  onSelectThread,
  onPrefetchThread,
  onUpdateThreadStatus,
}: {
  thread: Thread
  defaultTitle: string
  isSelected: boolean
  onSelectThread?: (threadId: string) => void
  onPrefetchThread?: (threadId: string) => void
  onUpdateThreadStatus?: (threadId: string, status: 'active' | 'archived') => void | Promise<void>
}) {
  const displayTitle = !thread.title || thread.title === 'New Chat'
    ? defaultTitle
    : thread.title

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl",
        isSelected
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <button
        type="button"
        onClick={() => onSelectThread?.(thread.id)}
        onPointerEnter={() => onPrefetchThread?.(thread.id)}
        onFocus={() => onPrefetchThread?.(thread.id)}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <MessageSquare className={cn(
          "w-4 h-4 shrink-0",
          isSelected ? "text-sidebar-primary" : "text-foreground-subtle"
        )} />
        <span className="text-sm font-medium truncate">{displayTitle}</span>
      </button>

      {thread.status === 'active' || thread.status === 'archived' ? (
        <ThreadActionMenu
          threadTitle={displayTitle}
          status={thread.status}
          onUpdateStatus={(status) => onUpdateThreadStatus?.(thread.id, status)}
        />
      ) : null}
    </div>
  )
}

// Menu Button (action)
function MenuButton({
  icon: Icon,
  label,
  onClick,
  isActive = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  isActive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className={cn("w-5 h-5", isActive && "text-sidebar-primary")} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}
