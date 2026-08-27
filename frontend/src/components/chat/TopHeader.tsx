'use client'

import { memo } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlanBadge } from './PlanBadge'
import { UserAvatarDropdown } from './UserAvatarDropdown'
import { useI18n } from '@/components/i18n/I18nProvider'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { useAppSidebarOptional } from '@/components/layout/AppSidebarContext'
import Link from 'next/link'

interface TopHeaderProps {
  onMobileMenuClick?: () => void
  className?: string
}

function TopHeaderComponent({ onMobileMenuClick, className }: TopHeaderProps) {
  const { t, locale } = useI18n()
  const sidebar = useAppSidebarOptional()

  return (
    <header className={cn(
      "h-14 flex items-center justify-between px-4 md:px-6 shrink-0 z-30",
      "bg-white/90 dark:bg-zinc-950/90",
      "backdrop-blur-xl",
      "border-b border-slate-200/60 dark:border-white/10",
      className
    )}>
      {/* Left: Mobile Hamburger (only on mobile) */}
      <div className="flex items-center gap-2">
        {/* Mobile-only Hamburger Button */}
        <button
          onClick={onMobileMenuClick}
          className={cn(
            "p-2 -ml-2 rounded-xl transition-all md:hidden",
            "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
            "dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
          )}
          aria-label={t('nav.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link
          href={`/${locale}`}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
            sidebar && !sidebar.isCollapsed && "md:hidden"
          )}
        >
          <BrandLogo textClassName="text-sm" />
        </Link>
      </div>

      {/* Right: PlanBadge + Avatar */}
      <div className="flex items-center gap-2">
        <PlanBadge />
        <UserAvatarDropdown align="end" side="bottom" size="sm" />
      </div>
    </header>
  )
}

export const TopHeader = memo(TopHeaderComponent)
