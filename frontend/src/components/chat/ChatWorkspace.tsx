"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ChatContainer } from "./ChatContainer"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { MobileMenuDrawer } from "./MobileMenuDrawer"
import { TopHeader } from "./TopHeader"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useI18n } from "@/components/i18n/I18nProvider"
import type { ChatUIMessage } from "@/lib/chat-ui"
import type { Thread } from "@/types"
import type { ChatExample } from "@/lib/chat-examples"

function VideoDetailLoading() {
  const { t } = useI18n()

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full items-center justify-center px-6 text-sm text-muted-foreground"
    >
      {t("tasks.loadingTask")}
    </div>
  )
}

const VideoDetailPanel = dynamic(
  () => import("./VideoDetailPanel").then((mod) => mod.VideoDetailPanel),
  { loading: () => <VideoDetailLoading /> }
)

interface ChatWorkspaceProps {
  activeThreadId: string | null
  selectedThreadId: string | null
  activeTaskId: string | null
  isThreadSwitching?: boolean
  switchingThreadTitle?: string | null
  taskSelectionNonce?: number
  initialMessages: ChatUIMessage[]
  isAuthenticated?: boolean | null
  onNewChat: () => void
  onSelectThread: (threadId: string) => void
  onSelectTask: (taskId: string | null) => void
  onSelectExample?: (taskId: string) => void
  onThreadCreated?: () => void
  onChatStarted?: (threadId: string, taskId?: string) => void
  threads?: Thread[]
  onUpdateThreadStatus?: (threadId: string, status: 'active' | 'archived') => void | Promise<void>
  initialExamples?: Promise<ChatExample[]> | null
}


export function ChatWorkspace({
  activeThreadId,
  selectedThreadId,
  activeTaskId,
  isThreadSwitching = false,
  switchingThreadTitle = null,
  taskSelectionNonce = 0,
  initialMessages,
  isAuthenticated = null,
  onNewChat,
  onSelectThread,
  onSelectTask,
  onSelectExample,
  onChatStarted,
  threads,
  onUpdateThreadStatus,
  initialExamples = null
}: ChatWorkspaceProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const router = useRouter()
  const { locale, t } = useI18n()

  // Resizable logic
  const [panelWidth, setPanelWidth] = useState(420)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const [closedSelectionKey, setClosedSelectionKey] = useState<string | null>(null)
  const selectionKey = activeTaskId ? `${activeTaskId}:${taskSelectionNonce}` : null
  const isPanelOpen = Boolean(activeTaskId && selectionKey !== closedSelectionKey)

  // Load width from localStorage or set default to 60%
  useEffect(() => {
    const savedWidth = localStorage.getItem("vibe_panel_width")
    if (savedWidth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelWidth(parseInt(savedWidth, 10))
    } else {
      // Default to 60% of screen width if no saved preference
      // This provides a better reading experience for the transcript/summary
      const defaultWidth = Math.floor(window.innerWidth * 0.6)
      // Ensure it respects min/max constraints we'll enforce later
      const constrainedWidth = Math.max(320, Math.min(defaultWidth, window.innerWidth - 320))
      setPanelWidth(constrainedWidth)
    }
  }, [])

  // Detect mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const syncIsMobile = (matches: boolean) => {
      setIsMobile(prev => (prev === matches ? prev : matches))
    }

    syncIsMobile(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      syncIsMobile(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  const setTaskParam = useCallback((nextTaskId: string | null) => {
    onSelectTask(nextTaskId)
  }, [onSelectTask])

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true)
  }, [])

  const openPanelForTask = useCallback((taskId: string) => {
    setClosedSelectionKey(null)
    setTaskParam(taskId)
  }, [setTaskParam])

  const closePanel = useCallback(() => {
    if (selectionKey) {
      setClosedSelectionKey(selectionKey)
    }
  }, [selectionKey])

  const handleMobileMenuChange = useCallback((open: boolean) => {
    setIsMobileMenuOpen(open)
  }, [])

  const handleMobileNewChat = useCallback(() => {
    onNewChat()
    setIsMobileMenuOpen(false)
  }, [onNewChat])

  const handleOpenLibrary = useCallback(() => {
    router.push(`/${locale}/explore`)
    setIsMobileMenuOpen(false)
  }, [router, locale])

  const handleSelectMobileThread = useCallback((id: string) => {
    onSelectThread(id)
    setIsMobileMenuOpen(false)
  }, [onSelectThread])

  // rAF throttle refs for smooth resize
  const pendingWidthRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const startResizing = useCallback(() => {
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    // Cancel any pending rAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    // Flush pending width
    if (pendingWidthRef.current !== null) {
      setPanelWidth(pendingWidthRef.current)
      localStorage.setItem("vibe_panel_width", pendingWidthRef.current.toString())
      pendingWidthRef.current = null
    } else {
      localStorage.setItem("vibe_panel_width", panelWidth.toString())
    }
    setIsResizing(false)
  }, [panelWidth])

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (!isResizing) return

      // Calculate new width: window width - mouse X - right margin (approx 16px)
      const newWidth = document.body.clientWidth - mouseMoveEvent.clientX - 16

      // Min 320px, Max: ensure left chat panel maintains at least 320px
      const maxAllowed = Math.max(320, document.body.clientWidth - 320)

      if (newWidth > 320 && newWidth < maxAllowed) {
        pendingWidthRef.current = newWidth
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            if (pendingWidthRef.current !== null) {
              setPanelWidth(pendingWidthRef.current)
            }
            rafIdRef.current = null
          })
        }
      }
    },
    [isResizing]
  )

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize)
      window.addEventListener("mouseup", stopResizing)
    }
    return () => {
      window.removeEventListener("mousemove", resize)
      window.removeEventListener("mouseup", stopResizing)
    }
  }, [isResizing, resize, stopResizing])

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])


  return (
    <div className="flex-1 flex flex-col h-screen relative overflow-hidden bg-transparent">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none dark:hidden -z-10">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <TopHeader onMobileMenuClick={openMobileMenu} />

      <MobileMenuDrawer
        isOpen={isMobileMenuOpen}
        onOpenChange={handleMobileMenuChange}
        onNewChat={handleMobileNewChat}
        onOpenLibrary={handleOpenLibrary}
        threads={threads}
        activeThreadId={activeThreadId}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectMobileThread}
        onUpdateThreadStatus={onUpdateThreadStatus}
      />

      {/* Main Layout: Chat + Details */}
      <main className="relative flex-1 flex m-3 lg:m-4 overflow-hidden gap-0"> {/* gap-0 because handle adds spacing if needed */}

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col min-h-0 glass-panel relative z-10",
        )}>
          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative h-full">
            <ChatContainer
              // Key ensures complete remount when switching threads to reset useChat state completely
              key={activeThreadId || 'new-chat'}
              threadId={activeThreadId}
              initialMessages={initialMessages}
              activeTaskId={activeTaskId}
              isAuthenticated={isAuthenticated}
              isInteractionLocked={isThreadSwitching}
              onOpenPanel={openPanelForTask}
              onSelectExample={onSelectExample || openPanelForTask}
              onChatStarted={onChatStarted}
              initialExamples={initialExamples}
            />
          </div>
        </div>

        {/* Resizer Handle (Desktop Only) */}
        {activeTaskId && isPanelOpen && (
          <div
            className="hidden lg:flex w-4 cursor-col-resize items-center justify-center hover:bg-white/5 transition-colors z-20"
            onMouseDown={startResizing}
          >
            <div className="w-1 h-8 rounded-full bg-slate-300 dark:bg-white/20" />
          </div>
        )}

        {/* Video Context Panel (Desktop) */}
        <aside
          ref={sidebarRef}
          className={cn(
            "hidden lg:flex flex-col glass-panel overflow-hidden",
            activeTaskId && isPanelOpen
              ? "opacity-100 ml-0 translate-x-0"
              : "w-0 opacity-0 ml-0 border-none translate-x-10",
            // Disable transition during resize to avoid lag/rubber-banding
            !isResizing && "transition-all duration-700 cubic-bezier(0.19, 1, 0.22, 1)"
          )}
          style={{
            width: activeTaskId && isPanelOpen ? panelWidth : 0
          }}
        >
          {activeTaskId && isPanelOpen && (
            <VideoDetailPanel
              key={activeTaskId}
              taskId={activeTaskId}
              onClose={closePanel}
            />
          )}
        </aside>

        {isThreadSwitching && (
          <div
            aria-label={switchingThreadTitle
              ? t('chat.openingThread', { title: switchingThreadTitle })
              : t('chat.openingChat')}
            className="absolute inset-0 z-30 flex items-center justify-center bg-white/32 dark:bg-black/24 backdrop-blur-[2px] transition-opacity duration-150"
          >
            <div className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-white/60 dark:border-white/10 bg-white/82 dark:bg-zinc-900/82 px-3 py-1.5 text-sm text-slate-600 dark:text-zinc-300 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-zinc-500" />
              <span>{t('chat.openingChat')}</span>
            </div>
          </div>
        )}

      </main>

      {/* Mobile Context Panel */}
      <Sheet
        open={!!(isMobile && activeTaskId && isPanelOpen)}
        onOpenChange={(open) => {
          if (isMobile && !open) closePanel()
        }}
      >
        <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-[2rem] border-t border-slate-200 dark:border-white/20 bg-white dark:bg-zinc-900 [&>button]:hidden">
          <SheetTitle className="sr-only">{t('chat.videoDetails')}</SheetTitle>
          {activeTaskId && isPanelOpen && (
            <VideoDetailPanel
              key={activeTaskId}
              taskId={activeTaskId}
              onClose={closePanel}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
