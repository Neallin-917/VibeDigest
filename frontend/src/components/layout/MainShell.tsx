"use client"

import React, { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { MobileBottomNav, MobileHeader } from "@/components/layout/MobileNav"
import { LandingNav } from "@/components/landing/LandingNav"
import { TaskNotificationListener } from "@/components/tasks/TaskNotificationListener"
import { useI18n } from "@/components/i18n/I18nProvider"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"

export function MainShell({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const isPublicTaskDetail = pathname?.includes('/tasks/')

  // Public paths that don't require authentication
  // /tasks/* is public so unauthenticated users can view demo tasks
  // Check for paths like: /tasks/..., /explore, or /en/tasks/..., /en/explore
  const isPublicPath =
    isPublicTaskDetail ||
    pathname?.endsWith('/tasks') ||
    pathname?.includes('/explore') ||
    pathname?.endsWith('/explore')
  const { data: user, isLoading } = useCurrentUserQuery({ enabled: !isPublicPath })
  const isAuthenticated = Boolean(user)

  useEffect(() => {
    if (!isPublicPath && !isLoading && !user) {
      router.replace(`/${locale}/login`)
    }
  }, [isLoading, isPublicPath, locale, router, user])

  // Show loading spinner while checking auth (but allow public paths through)
  if (isLoading && !isPublicPath) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  // For protected paths, wait for authentication
  if (!isPublicPath && !isAuthenticated && !isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (isPublicTaskDetail) {
    return (
      <div className="relative min-h-screen overflow-x-clip bg-background">
        <div className="pointer-events-none fixed inset-0 bg-grid opacity-20" />
        <div className="pointer-events-none fixed left-0 top-0 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
        <div
          data-slot="task-detail-nav-scrim"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-24 bg-background/95 backdrop-blur-sm"
          aria-hidden="true"
        />
        <LandingNav variant="content" />
        <main className="relative flex min-h-screen flex-col pt-24">
          {children}
        </main>
      </div>
    )
  }

  return (
    <AppSidebarProvider defaultCollapsed={true}>
      <div className="flex h-dvh overflow-hidden">
        <TaskNotificationListener />

        {/* Grid background for entire app */}
        <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none z-0" />

        {/* Background glow for glass effect - Adapted for both modes */}
        <div className="pointer-events-none fixed left-0 top-0 z-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 mix-blend-multiply blur-[150px]" />
        <div className="pointer-events-none fixed bottom-0 right-0 z-0 h-[500px] w-[500px] translate-x-1/2 translate-y-1/2 rounded-full bg-primary-muted/6 blur-[120px]" />

        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </AppSidebarProvider>
  )
}
