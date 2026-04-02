"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { AppSidebarProvider } from "@/components/layout/AppSidebarContext"
import { MobileBottomNav, MobileHeader } from "@/components/layout/MobileNav"
import { TaskNotificationListener } from "@/components/tasks/TaskNotificationListener"
import { useI18n } from "@/components/i18n/I18nProvider"
import { createClient } from "@/lib/supabase"

export function MainShell({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Public paths that don't require authentication
  // /tasks/* is public so unauthenticated users can view demo tasks
  // Check for paths like: /tasks/..., /explore, or /en/tasks/..., /en/explore
  const isPublicPath =
    pathname?.includes('/tasks/') ||
    pathname?.endsWith('/tasks') ||
    pathname?.includes('/explore') ||
    pathname?.endsWith('/explore')

  // Check authentication on mount and listen for auth changes
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user && !isPublicPath) {
        // Redirect to login page if not authenticated and not on public path
        router.replace(`/${locale}/login`)
        return
      }
      setIsAuthenticated(!!user)
      setIsLoading(false)
    }

    checkAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !isPublicPath) {
        router.replace(`/${locale}/login`)
      } else {
        setIsAuthenticated(!!session)
        setIsLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase, isPublicPath, locale])

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

  return (
    <AppSidebarProvider defaultCollapsed={true}>
      <div className="flex h-dvh overflow-hidden">
        <TaskNotificationListener />

        {/* Grid background for entire app */}
        <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none z-0" />

        {/* Background glow for glass effect - Adapted for both modes */}
        <div className="fixed top-0 left-0 w-[700px] h-[700px] bg-primary/5 blur-[150px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0 mix-blend-multiply dark:mix-blend-normal" />
        <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-emerald-600/6 blur-[120px] rounded-full pointer-events-none translate-x-1/2 translate-y-1/2 z-0" />

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

