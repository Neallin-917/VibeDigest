'use client'

import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlanBadge } from './PlanBadge'
import { UserAvatarDropdown } from './UserAvatarDropdown'

interface TopHeaderProps {
  onMobileMenuClick?: () => void
  className?: string
}

export function TopHeader({ onMobileMenuClick, className }: TopHeaderProps) {
  return (
    <header className={cn(
      "h-14 flex items-center justify-between px-4 md:px-6 shrink-0 z-30",
      "bg-slate-100/90 dark:bg-zinc-900/80",
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
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right: PlanBadge + Avatar */}
      <div className="flex items-center gap-2">
        <PlanBadge />
        <UserAvatarDropdown align="end" side="bottom" size="sm" />
      </div>
    </header>
  )
}
