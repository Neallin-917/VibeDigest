"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { LogOut, Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { NAV_ITEMS } from "@/components/layout/navItems"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { BrandLogo } from "./BrandLogo"

function isActiveNav(pathname: string, href: string) {
  if (pathname === href) return true
  if (pathname.startsWith(`${href}/`)) return true
  // Task detail is conceptually part of History.
  // Match both /locale/history and /locale/tasks/xxx
  if (href.includes('/history') && pathname.includes('/tasks/')) return true
  return false
}

export function MobileHeader() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const { t, locale } = useI18n()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))
  }, [supabase])

  return (
    <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-black/40 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <Link href={`/${locale}`} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
          <BrandLogo />
        </Link>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("nav.menu")} suppressHydrationWarning>
              <Menu className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border-slate-200/60 dark:border-white/10 p-4">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base">{t("nav.menu")}</DialogTitle>
            </DialogHeader>

            {userEmail ? (
              <div className="-mt-1 pb-3 text-xs text-muted-foreground truncate border-b border-slate-200 dark:border-white/10">
                {userEmail}
              </div>
            ) : null}

            <div className="space-y-2">
              {NAV_ITEMS.map((item) => {
                return (
                  <DialogClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-slate-100 dark:hover:bg-white/5 hover:text-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      {t(item.key)}
                    </Link>
                  </DialogClose>
                )
              })}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
              <FeedbackDialog />
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    // Disable One Tap auto-select to prevent auto-login loop
                    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
                      window.google.accounts.id.disableAutoSelect()
                    }
                    await supabase.auth.signOut()
                    window.location.href = `/${locale}`
                  }}
                  className="w-full justify-start gap-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  {t("auth.logout")}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-black/60 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 w-full">
        {NAV_ITEMS.map((item) => {
          const isActive = isActiveNav(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate max-w-[72px]">{t(item.key)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
