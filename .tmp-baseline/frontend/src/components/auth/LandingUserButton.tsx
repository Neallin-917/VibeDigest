"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface User {
    email?: string
    user_metadata?: {
        avatar_url?: string
        full_name?: string
        name?: string
    }
}

export function LandingUserButton() {
    const { t, locale } = useI18n()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        let mounted = true

        // Check initial session with timeout
        const checkUser = async () => {
            try {
                // specific timeout to prevent infinite loading state
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Auth check timeout')), 5000)
                )
                
                const authPromise = supabase.auth.getUser()
                
                const { data } = await Promise.race([authPromise, timeoutPromise]) as { data: { user: User | null } }
                
                if (mounted) {
                    setUser(data?.user ?? null)
                }
            } catch (error) {
                console.warn("Auth check failed or timed out", error)
                if (mounted) setUser(null)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        checkUser()

        // Listen for auth changes (including One Tap login)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (mounted) {
                setUser(session?.user ?? null)
                // Ensure loading is cleared when auth state changes
                setLoading(false)
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [supabase])

    const handleLogout = async () => {
        // Disable One Tap auto-select to prevent auto-login loop
        if (typeof window !== 'undefined' && window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect()
        }
        await supabase.auth.signOut()
        setUser(null)
    }

    // Still loading
    if (loading) {
        return (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
        )
    }

    // Not logged in - show Sign Up button
    if (!user) {
        return (
            <Link href={`/${locale}/login`}>
                <Button variant="outline" size="sm" className="gap-2 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20">
                    {t("auth.signUp")}
                </Button>
            </Link>
        )
    }

    // Logged in - show dashboard button with avatar
    const avatarUrl = user.user_metadata?.avatar_url
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
    const initials = displayName.charAt(0).toUpperCase()

    return (
        <div className="flex items-center gap-2">
            {/* Direct Dashboard Button */}
            <Link href={`/${locale}/chat`}>
                <Button variant="outline" size="sm" className="gap-2 backdrop-blur-md bg-white/30 dark:bg-white/10 border-white/40 dark:border-white/10 shadow-sm hover:shadow-md hover:bg-white/50 dark:hover:bg-white/20 transition-all text-primary font-medium">
                    {t("auth.goToDashboard")}
                </Button>
            </Link>

            {/* Avatar with Dropdown */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary/50">
                        {avatarUrl ? (
                            <Image
                                src={avatarUrl}
                                alt={displayName}
                                width={32}
                                height={32}
                                unoptimized
                                className="rounded-full border border-black/10 dark:border-white/20"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-medium">
                                {initials}
                            </div>
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        {t("auth.logout")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
