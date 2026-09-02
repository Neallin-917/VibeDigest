"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo } from "react"
import { LogOut, Menu } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { NAV_ITEMS } from "@/components/layout/navItems"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { accountKeys, useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { BrandLogo } from "./BrandLogo"

function localizeNavHref(locale: string, href: string) {
  return `/${locale}${href}`
}

function findActiveNavHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right.length - left.length)[0]
}

export function MobileHeader() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()
  const { data: user } = useCurrentUserQuery()
  const userEmail = user?.email ?? null

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

  return (
    <div className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md md:hidden">
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
          <DialogContent className="border-border/80 bg-card/90 p-4 backdrop-blur-xl">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base">{t("nav.menu")}</DialogTitle>
            </DialogHeader>

            {userEmail ? (
              <div className="-mt-1 truncate border-b border-border pb-3 text-xs text-muted-foreground">
                {userEmail}
              </div>
            ) : null}

            <div className="space-y-2">
              {NAV_ITEMS.map((item) => {
                const href = localizeNavHref(locale, item.href)
                return (
                  <DialogClose asChild key={item.href}>
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      {t(item.key)}
                    </Link>
                  </DialogClose>
                )
              })}
            </div>

            <div className="space-y-2 border-t border-border pt-2">
              <FeedbackDialog />
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
  const { t, locale } = useI18n()
  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    href: localizeNavHref(locale, item.href),
  }))
  const activeHref = findActiveNavHref(pathname, navItems.map((item) => item.href))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="grid grid-cols-4 w-full">
        {navItems.map((item) => {
          const isActive = activeHref === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
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
