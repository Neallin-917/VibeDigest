"use client"

import Link from "next/link"
import { useState, useEffect, useMemo } from "react"
import { Settings, LogOut, CreditCard, Sun, Moon, MessageSquareWarning } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { useI18n } from "@/components/i18n/I18nProvider"

interface UserAvatarDropdownProps {
  className?: string
  /** Size variant for different placements */
  size?: "sm" | "md"
  /** Dropdown alignment */
  align?: "start" | "center" | "end"
  /** Dropdown side */
  side?: "top" | "right" | "bottom" | "left"
}

export function UserAvatarDropdown({ 
  className, 
  size = "md",
  align = "end",
  side = "bottom"
}: UserAvatarDropdownProps) {
  const { theme, setTheme } = useTheme()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const { t, locale } = useI18n()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null)
    })
  }, [supabase])

  const handleLogout = async () => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const avatarSize = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 md:h-10 md:w-10 text-xs"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className={cn(
              "rounded-full bg-gradient-to-tr from-emerald-600 to-teal-600 border-2 border-white dark:border-white/20 shadow-sm hover:scale-105 transition-transform flex items-center justify-center text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 dark:focus:ring-emerald-500/50",
              avatarSize,
              className
            )}
          >
            {userEmail?.charAt(0).toUpperCase() || "U"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align={align} 
          side={side} 
          className="w-56"
          sideOffset={8}
        >
          {/* User Info */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
            <p className="text-sm font-medium truncate">
              {userEmail?.split('@')[0] || "User"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
          </div>

          {/* Theme Toggle */}
          <DropdownMenuItem
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="cursor-pointer"
          >
            <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute ml-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="ml-6 dark:ml-0">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Settings */}
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${locale}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
              {t('nav.settings')}
            </Link>
          </DropdownMenuItem>

          {/* Pricing */}
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${locale}/settings/pricing`}>
              <CreditCard className="mr-2 h-4 w-4" />
              {t('nav.pricing')}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Feedback */}
          <DropdownMenuItem
            onClick={() => setFeedbackOpen(true)}
            className="cursor-pointer"
          >
            <MessageSquareWarning className="mr-2 h-4 w-4" />
            {t('feedback.title')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-red-500 focus:text-red-500 dark:text-red-400 dark:focus:text-red-400 cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('auth.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Feedback Dialog - Controlled externally */}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
