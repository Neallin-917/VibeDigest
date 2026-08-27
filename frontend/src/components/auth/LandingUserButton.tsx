"use client"

import { useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Button } from "@/components/ui/button"
import { accountKeys, useCurrentUserQuery } from "@/hooks/useAccountQueries"
import { LogOut } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function LandingUserButton() {
    const { t, locale } = useI18n()
    const supabase = useMemo(() => createClient(), [])
    const queryClient = useQueryClient()
    const { data: user, isPending } = useCurrentUserQuery()

    const handleLogout = async () => {
        // Disable One Tap auto-select to prevent auto-login loop
        if (typeof window !== 'undefined' && window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect()
        }
        await supabase.auth.signOut()
        queryClient.setQueryData(accountKeys.currentUser, null)
        queryClient.removeQueries({ queryKey: accountKeys.profiles })
    }

    if (isPending) {
        return <div className="h-11 w-20 md:h-9" aria-hidden="true" />
    }

    if (!user) {
        return (
            <Button
                asChild
                variant="outline"
                size="sm"
                className="h-11 gap-2 border-border bg-card/35 text-foreground hover:border-border-strong hover:bg-card/70 md:h-9"
            >
                <Link href={`/${locale}/login`}>
                    {t("auth.signUp")}
                </Link>
            </Button>
        )
    }

    const avatarUrl = user.user_metadata?.avatar_url
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
    const initials = displayName.charAt(0).toUpperCase()

    return (
        <div className="flex items-center gap-2">
            <Button
                asChild
                variant="outline"
                size="sm"
                className="hidden gap-2 border-border bg-card/45 font-medium text-primary shadow-sm transition-colors hover:border-border-strong hover:bg-card/75 md:inline-flex"
            >
                <Link href={`/${locale}/chat`}>
                    {t("auth.goToDashboard")}
                </Link>
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        aria-label={t("chat.moreOptionsHint")}
                        className="flex h-11 w-11 items-center justify-center gap-2 rounded-full transition-all hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                        {avatarUrl ? (
                            <Image
                                src={avatarUrl}
                                alt={displayName}
                                width={32}
                                height={32}
                                unoptimized
                                className="rounded-full border border-border"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-medium">
                                {initials}
                            </div>
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <div className="border-b border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
                        <LogOut className="mr-2 h-4 w-4" />
                        {t("auth.logout")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
