"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChatContainer } from "./ChatContainer"
import { Loader2 } from "lucide-react"
import { MobileMenuDrawer } from "./MobileMenuDrawer"
import { TopHeader } from "./TopHeader"
import { useI18n } from "@/components/i18n/I18nProvider"
import type { ChatUIMessage } from "@/lib/chat-ui"
import type { Thread } from "@/types"
import type { ChatExample } from "@/lib/chat-examples"

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
  onSelectExample?: (task: ChatExample) => void
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
  initialMessages,
  isAuthenticated = null,
  onNewChat,
  onSelectThread,
  onSelectExample,
  onChatStarted,
  threads,
  onUpdateThreadStatus,
  initialExamples = null
}: ChatWorkspaceProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const { locale, t } = useI18n()
  const switchingStatus = switchingThreadTitle
    ? t('chat.openingThread', { title: switchingThreadTitle })
    : t('chat.openingChat')

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true)
  }, [])

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

  return (
    <div className="flex-1 min-w-0 flex flex-col h-screen relative overflow-hidden bg-transparent">
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

      <main className="relative flex-1 min-w-0 flex m-3 lg:m-4 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col min-h-0 glass-panel relative z-10">
          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative h-full">
            <ChatContainer
              // Key ensures complete remount when switching threads to reset useChat state completely
              key={activeThreadId || 'new-chat'}
              threadId={activeThreadId}
              initialMessages={initialMessages}
              activeTaskId={activeTaskId}
              isAuthenticated={isAuthenticated}
              isInteractionLocked={isThreadSwitching}
              onSelectExample={onSelectExample}
              onChatStarted={onChatStarted}
              initialExamples={initialExamples}
            />
          </div>
        </div>

        {isThreadSwitching && (
          <div
            aria-label={switchingStatus}
            className="absolute inset-0 z-30 flex items-center justify-center bg-background/35 backdrop-blur-[2px] transition-opacity duration-150"
          >
            <div className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-processing" />
              <span className="max-w-[min(20rem,calc(100vw-7rem))] truncate">{switchingStatus}</span>
            </div>
          </div>
        )}

      </main>

    </div>
  )
}
