"use client"

import { Suspense } from "react"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { useAuth } from "@/hooks/useAuth"
import { useThreadsQuery } from "@/hooks/useThreadsQuery"
import { useThreadNavigation } from "@/hooks/useThreadNavigation"

function ChatPageContent() {
    const { isAuthenticated } = useAuth()
    const { threads, refetch: refetchThreads } = useThreadsQuery()
    const nav = useThreadNavigation({ threads, refetchThreads })

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
                        isAuthenticated={isAuthenticated ?? false}
                        onNewChat={nav.handleNewChat}
                        onSelectThread={nav.handleSelectThread}
                        onSelectTask={nav.handleSelectTask}
                        onSelectExample={nav.handleSelectExample}
                        onThreadCreated={refetchThreads}
                        onChatStarted={nav.handleChatStarted}
                        threads={threads}
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
