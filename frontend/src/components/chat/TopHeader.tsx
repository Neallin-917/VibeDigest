'use client'

import { memo } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppearanceSelector } from '@/components/layout/AppearanceSelector'
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
      "bg-background/90",
      "backdrop-blur-xl",
      "border-b border-border/70",
      className
    )}>
      {/* Left: Mobile Hamburger (only on mobile) */}
      <div className="flex items-center gap-2">
        {/* Mobile-only Hamburger Button */}
        <button
          onClick={onMobileMenuClick}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center -ml-2 rounded-xl transition-all md:hidden",
            "text-foreground-subtle hover:bg-accent hover:text-accent-foreground"
          )}
          aria-label={t('nav.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link
          href={`/${locale}`}
          aria-label="VibeDigest"
          className={cn(
            "inline-flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            sidebar && !sidebar.isCollapsed && "md:hidden"
          )}
        >
          <BrandLogo textClassName="text-sm max-[359px]:hidden" />
        </Link>
      </div>

      {/* Right: PlanBadge + Avatar */}
      <div className="flex shrink-0 items-center gap-2">
        <AppearanceSelector />
        <PlanBadge />
        <UserAvatarDropdown align="end" side="bottom" size="sm" className="min-h-11 min-w-11" />
      </div>
    </header>
  )
}

export const TopHeader = memo(TopHeaderComponent)
