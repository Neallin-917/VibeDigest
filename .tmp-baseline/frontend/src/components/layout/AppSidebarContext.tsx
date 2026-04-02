"use client"

import { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface AppSidebarContextValue {
  isCollapsed: boolean
  toggleSidebar: () => void
  setCollapsed: (collapsed: boolean) => void
}

const AppSidebarContext = createContext<AppSidebarContextValue | undefined>(undefined)

interface AppSidebarProviderProps {
  children: ReactNode
  defaultCollapsed?: boolean
}

export function AppSidebarProvider({ 
  children, 
  defaultCollapsed = true 
}: AppSidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed)
  }, [])

  return (
    <AppSidebarContext.Provider value={{ isCollapsed, toggleSidebar, setCollapsed }}>
      {children}
    </AppSidebarContext.Provider>
  )
}

export function useAppSidebar() {
  const context = useContext(AppSidebarContext)
  if (context === undefined) {
    throw new Error("useAppSidebar must be used within an AppSidebarProvider")
  }
  return context
}

// Optional hook that doesn't throw if used outside provider (for optional sidebar pages)
export function useAppSidebarOptional() {
  return useContext(AppSidebarContext)
}
