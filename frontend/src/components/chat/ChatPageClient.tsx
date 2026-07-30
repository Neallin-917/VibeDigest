"use client"

import { Suspense } from "react"
import { toast } from "sonner"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { useAuth } from "@/hooks/useAuth"
import { useThreadsQuery } from "@/hooks/useThreadsQuery"
import { useThreadNavigation } from "@/hooks/useThreadNavigation"

function ChatPageContent() {
    const { isAuthenticated } = useAuth()
    const { threads, refetch: refetchThreads, updateThreadStatus } = useThreadsQuery()
    const nav = useThreadNavigation({ threads, refetchThreads })

    const handleUpdateThreadStatus = async (threadId: string, status: 'active' | 'archived') => {
        try {
            await updateThreadStatus(threadId, status)
        } catch (error) {
            console.error('Failed to update thread status', error)
            toast.error(status === 'archived' ? 'Failed to archive chat' : 'Failed to restore chat')
        }
    }

    return (
        <AppSidebarProvider defaultCollapsed={true}>
            <div className="h-screen w-full flex text-foreground overflow-hidden">
                <AppSidebar
                    threads={threads}
                    activeThreadId={nav.activeThreadId}
                    selectedThreadId={nav.selectedThreadId}
                    onNewChat={nav.handleNewChat}
                    onSelectThread={nav.handleSelectThread}
                    onPrefetchThread={nav.prefetchThread}
                    onUpdateThreadStatus={handleUpdateThreadStatus}
                />

                {nav.isBootstrapping ? (
                    <div className="flex-1 h-screen bg-background" />
                ) : (
                    <ChatWorkspace
                        activeThreadId={nav.activeThreadId}
                        selectedThreadId={nav.selectedThreadId}
                        activeTaskId={nav.activeTaskId}
                        isThreadSwitching={nav.isThreadSwitching}
                        switchingThreadTitle={nav.switchingThreadTitle}
                        taskSelectionNonce={nav.taskSelectionNonce}
                        initialMessages={nav.initialMessages}
                        isAuthenticated={isAuthenticated}
                        onNewChat={nav.handleNewChat}
                        onSelectThread={nav.handleSelectThread}
                        onSelectTask={nav.handleSelectTask}
                        onSelectExample={nav.handleSelectExample}
                        onThreadCreated={refetchThreads}
                        onChatStarted={nav.handleChatStarted}
                        threads={threads}
                        onUpdateThreadStatus={handleUpdateThreadStatus}
                    />
                )}
            </div>
        </AppSidebarProvider>
    )
}

export function ChatPageClient() {
    return (
        <Suspense fallback={<div className="h-screen w-full bg-background" />}>
            <ChatPageContent />
        </Suspense>
    )
}
