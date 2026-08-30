"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useMemo, useSyncExternalStore } from "react"
import { Settings, LogOut, CreditCard, MessageSquareWarning } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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
import { accountKeys, useCurrentUserQuery } from "@/hooks/useAccountQueries"

interface UserAvatarDropdownProps {
  className?: string
  /** Size variant for different placements */
  size?: "sm" | "md"
  /** Dropdown alignment */
  align?: "start" | "center" | "end"
  /** Dropdown side */
  side?: "top" | "right" | "bottom" | "left"
}

const subscribeToHydration = () => () => undefined

export function UserAvatarDropdown({ 
  className, 
  size = "md",
  align = "end",
  side = "bottom"
}: UserAvatarDropdownProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()
  const { data: user } = useCurrentUserQuery()
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  // A warm browser query cache can differ from the server's account snapshot.
  const userEmail = hasHydrated ? user?.email ?? null : null

  const handleLogout = async () => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      queryClient.setQueryData(accountKeys.currentUser, null)
      queryClient.removeQueries({ queryKey: accountKeys.profiles })
      router.replace(`/${locale}`)
      router.refresh()
    } catch {
      toast.error(t("auth.signOutFailed"))
    }
  }

  const avatarSize = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 md:h-10 md:w-10 text-xs"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            aria-label={t('chat.moreOptionsHint')}
            className={cn(
              "flex items-center justify-center rounded-full border-2 border-white bg-gradient-to-tr from-emerald-600 to-teal-600 font-bold text-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
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
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-sm font-medium truncate">
              {userEmail?.split('@')[0] || "User"}
            </p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          </div>

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
            className="cursor-pointer text-red-500 focus:text-red-500"
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
