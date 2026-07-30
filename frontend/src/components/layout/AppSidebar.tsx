"use client"

import { useMemo, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { v4 as uuidv4 } from "uuid"
import {
  Plus,
  Library,
  ChevronDown,
  ChevronRight,
  Menu,
  Sparkles,
  MessageSquare
} from "lucide-react"
import { cn } from "@/lib/utils"
// import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip" // Removed unused import
import { useAppSidebar } from "./AppSidebarContext"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Thread } from "@/types"
import { useProgressiveThreadList } from "@/hooks/useProgressiveThreadList"
import { CollapsedView } from "./sidebar/CollapsedView"
import { ThreadActionMenu } from "./sidebar/ThreadActionMenu"

interface AppSidebarProps {
  onNewChat?: () => void
  className?: string
  threads?: Thread[]
  activeThreadId?: string | null
  selectedThreadId?: string | null
  onSelectThread?: (threadId: string) => void
  onPrefetchThread?: (threadId: string) => void
  onUpdateThreadStatus?: (threadId: string, status: 'active' | 'archived') => void | Promise<void>
}

export function AppSidebar({
  onNewChat,
  className,
  threads = [],
  activeThreadId,
  selectedThreadId,
  onSelectThread,
  onPrefetchThread,
  onUpdateThreadStatus
}: AppSidebarProps) {
  const { isCollapsed, toggleSidebar } = useAppSidebar()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t, locale } = useI18n()

  const currentSelectedThreadId = selectedThreadId ?? activeThreadId
  const isNewChatActive = pathname?.endsWith('/chat') && !searchParams?.get('task') && !currentSelectedThreadId
  const isCommunityActive = pathname?.includes('/explore')

  // Local UI States
  const [isChatsOpen, setIsChatsOpen] = useState(true)
  const [isArchivedOpen, setIsArchivedOpen] = useState(false)
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

  // Handle new chat
  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat()
    } else {
      router.push(`/${locale}/chat?threadId=${uuidv4()}`)
    }
  }

  // Handle community click
  const handleCommunityClick = () => {
    router.push(`/${locale}/explore`)
  }

  return (
    <aside
      className={cn(
        "h-screen flex-none flex flex-col py-4 hidden md:flex transition-all duration-300 ease-in-out relative z-30",
        "border-r backdrop-blur-xl",
        "bg-slate-100/90 border-slate-200/60",
        "dark:bg-zinc-900/80 dark:border-white/10",
        isCollapsed ? "w-[72px] px-3" : "w-[280px] px-4",
        className
      )}
    >
      {/* Hamburger Button - Always at top-left */}
      <div className={cn(
        "flex items-center mb-4 gap-3",
        isCollapsed ? "justify-center" : "justify-start px-2"
      )}>
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-2.5 rounded-xl transition-all",
            "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
            "dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
          )}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Logo - Only visible when expanded or we can show icon when collapsed */}
        {!isCollapsed && (
          <button
            type="button"
            onClick={() => router.push(`/${locale}`)}
            className="flex items-center gap-2 cursor-pointer group"
            aria-label="Go to home"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-300 tracking-tight group-hover:opacity-90">
              VibeDigest
            </span>
          </button>
        )}
      </div>

      {isCollapsed ? (
        // ========== COLLAPSED VIEW ==========
        <CollapsedView
          onNewChat={handleNewChat}
          onCommunityClick={handleCommunityClick}
          t={t}
        />
      ) : (
        // ========== EXPANDED VIEW ==========
        <>
          {/* New Task Button */}
          <button
            onClick={handleNewChat}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-1 mx-1",
              isNewChatActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-900/5"
                : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
            )}
          >
            <Plus className={cn("w-5 h-5", isNewChatActive && "text-emerald-600 dark:text-emerald-400")} />
            <span className="text-sm font-medium">{t("chat.newChat") || "New chat"}</span>
          </button>

          {/* Community Button */}
          <button
            onClick={handleCommunityClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-3 mx-1",
              isCommunityActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 font-semibold shadow-sm shadow-emerald-900/5"
                : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
            )}
          >
            <Library className={cn("w-5 h-5", isCommunityActive && "text-emerald-600 dark:text-emerald-400")} />
            <span className="text-sm font-medium">{t("chat.community") || "Community"}</span>
          </button>

          {/* Divider */}
          <div className="h-px mx-3 mb-3 bg-slate-200/60 dark:bg-white/10" />

          {/* Chats Section */}
          <div className="flex-1 min-h-0 flex flex-col mb-2">
            <button
              onClick={() => setIsChatsOpen(!isChatsOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-xl mx-1",
                "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                "dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
              )}
            >
              {isChatsOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span>{t("chat.chats") || "Chats"}</span>
            </button>

            {isChatsOpen && (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-1 px-1 space-y-0.5">
                {activeThreads.length === 0 ? (
                  <div className="text-center py-4 px-4">
                    <p className="text-xs text-slate-400">
                      {archivedThreads.length === 0 ? t("chat.noChats") : t("chat.noActiveChats")}
                    </p>
                  </div>
                ) : (
                  visibleActiveThreads.map(thread => (
                    <ThreadListItem
                      key={thread.id}
                      thread={thread}
                      defaultTitle={t("chat.newChat")}
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
                    className="w-full rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
                  >
                    {t("chat.loadMore")}
                  </button>
                ) : null}

                {archivedThreads.length > 0 ? (
                  <div className="pt-3">
                    <button
                      type="button"
                      aria-label="Toggle archived chats"
                      onClick={() => setIsArchivedOpen((open) => !open)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-xl",
                        "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                        "dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
                      )}
                    >
                      {shouldShowArchivedThreads ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span>{t("chat.archived") || "Archived"}</span>
                    </button>

                    {shouldShowArchivedThreads ? (
                      <div className="mt-1 space-y-0.5">
                        {visibleArchivedThreads.map((thread) => (
                          <ThreadListItem
                            key={thread.id}
                            thread={thread}
                            defaultTitle={t("chat.newChat")}
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
                            className="w-full rounded-xl px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
                          >
                            {t("chat.loadMore")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="h-2" />
        </>
      )}
    </aside>
  )
}

function ThreadListItem({
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
        "group flex items-center gap-1 rounded-xl transition-all",
        "hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300",
        isSelected && "bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      )}
    >
      <button
        type="button"
        onClick={() => onSelectThread?.(thread.id)}
        onPointerEnter={() => onPrefetchThread?.(thread.id)}
        onFocus={() => onPrefetchThread?.(thread.id)}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
      >
        <MessageSquare className={cn(
          "w-4 h-4 shrink-0",
          isSelected ? "text-emerald-500" : "text-slate-400"
        )} />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">
            {displayTitle}
          </div>
        </div>
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
