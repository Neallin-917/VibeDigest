'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { createClient } from '@/lib/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Profile = {
  tier: 'free' | 'pro' | string
  usage_count: number
  usage_limit: number
}

export function PlanBadge() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const { t, locale } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data, error } = await supabase
            .from("profiles")
            .select("tier, usage_count, usage_limit")
            .eq("id", user.id)
            .single()

          if (error && error.code === 'PGRST116') {
            // Profile not found, default to free
            setProfile({
              tier: 'free',
              usage_count: 0,
              usage_limit: 3,
            })
          } else if (data) {
            setProfile(data as Profile)
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [supabase])

  // Don't render until loaded
  if (loading || !profile) {
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
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            isPro
              ? "bg-emerald-50/50 border-emerald-200/60 text-emerald-800 hover:bg-emerald-100/50 dark:bg-emerald-900/30 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 focus:ring-emerald-500/50"
              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 focus:ring-slate-500/50"
          )}
        >
          <span>{tierLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0 rounded-2xl border-slate-200 dark:border-white/10 shadow-xl" sideOffset={8}>
        {/* Header: Plan Info + Upgrade Button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-bold text-slate-800 dark:text-white tracking-tight">
              {tierLabel}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('pricing.currentPlan')}
            </span>
          </div>
          {!isPro && (
            <Link
              href={`/${locale}/settings/pricing`}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm",
                "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700",
                "dark:bg-white/10 dark:border-white/10 dark:hover:bg-white/20 dark:text-white"
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-emerald-400" />
              <span>{t('dashboard.upgrade')}</span>
            </Link>
          )}
        </div>

        {/* Balance Row */}
        <Link
          href={`/${locale}/settings/pricing`}
          className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
        >
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('dashboard.usage.monthly')}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              {profile.usage_count} / {profile.usage_limit}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
