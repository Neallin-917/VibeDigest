'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useCurrentUserQuery, useProfileQuery } from '@/hooks/useAccountQueries'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PlanBadge() {
  const { t, locale } = useI18n()
  const { data: user, isLoading: userLoading } = useCurrentUserQuery()
  const { data: profile, isLoading: profileLoading } = useProfileQuery(user?.id)

  // Don't render until loaded
  if (userLoading || !user || profileLoading || !profile) {
    return null
  }

  const isPro = profile.tier === 'pro'
  const tierLabel = isPro ? t('pricing.pro.title') : t('pricing.free.title')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            isPro
              ? "border-primary/25 bg-accent/70 text-accent-foreground hover:bg-accent"
              : "border-border bg-surface/80 text-foreground-soft hover:bg-surface-subtle"
          )}
        >
          <span>{tierLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl border-border p-0 shadow-xl" sideOffset={8}>
        {/* Header: Plan Info + Upgrade Button */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold tracking-tight text-foreground">
              {tierLabel}
            </span>
            <span className="text-xs text-foreground-subtle">
              {t('pricing.currentPlan')}
            </span>
          </div>
          {!isPro && (
            <Link
              href={`/${locale}/settings/pricing`}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm",
                "border border-border bg-card text-foreground-soft hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{t('dashboard.upgrade')}</span>
            </Link>
          )}
        </div>

        {/* Balance Row */}
        <Link
          href={`/${locale}/settings/pricing`}
          className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface"
        >
          <span className="text-sm font-medium text-foreground-soft">
            {t('dashboard.usage.monthly')}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {profile.usage_count} / {profile.usage_limit}
            </span>
            <ChevronRight className="h-4 w-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
