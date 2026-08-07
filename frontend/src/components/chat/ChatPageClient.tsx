"use client"

import { Suspense } from "react"
import { toast } from "sonner"
import { ChatWorkspace } from "@/components/chat/ChatWorkspace"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { useAuth } from "@/hooks/useAuth"
import { useThreadsQuery } from "@/hooks/useThreadsQuery"
import { useThreadNavigation } from "@/hooks/useThreadNavigation"
import type { ChatExample } from "@/lib/chat-examples"

function ChatPageContent({
    initialExamples,
    publicExample,
}: {
    initialExamples: Promise<ChatExample[]> | null
    publicExample: ChatExample | null
}) {
    const { isAuthenticated } = useAuth()
    const { threads, refetch: refetchThreads, updateThreadStatus } = useThreadsQuery({
        enabled: isAuthenticated === true,
    })
    const nav = useThreadNavigation({ threads, refetchThreads, publicExample })

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

                <ChatWorkspace
                    activeThreadId={nav.activeThreadId}
                    selectedThreadId={nav.selectedThreadId}
                    activeTaskId={nav.activeTaskId}
                    isThreadSwitching={nav.isThreadSwitching || nav.isBootstrapping}
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
                    initialExamples={initialExamples}
                />
            </div>
        </AppSidebarProvider>
    )
}

export function ChatPageClient({
    initialExamples = null,
    publicExample = null,
}: {
    initialExamples?: Promise<ChatExample[]> | null
    publicExample?: ChatExample | null
}) {
    return (
        <Suspense fallback={<div className="h-screen w-full bg-background" />}>
            <ChatPageContent initialExamples={initialExamples} publicExample={publicExample} />
        </Suspense>
    )
}
