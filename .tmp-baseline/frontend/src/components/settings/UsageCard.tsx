"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Zap, Database, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

type Profile = {
    tier: 'free' | 'pro' | string
    usage_count: number
    usage_limit: number
    extra_credits: number
}

export function UsageCard({ className }: { className?: string }) {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const { t } = useI18n()
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()

                    if (error && error.code === 'PGRST116') {
                        // Profile not found (likely existing user before pricing), default to free
                        setProfile({
                            tier: 'free',
                            usage_count: 0,
                            usage_limit: 3,
                            extra_credits: 0
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

    if (loading) return null
    // removed if (!profile) return null to allow rendering default state if setProfile logic above works
    if (!profile) return null

    const usagePercent = Math.min((profile.usage_count / profile.usage_limit) * 100, 100)
    const isPro = profile.tier === 'pro'

    return (
        <Card className={cn("border-white/10 bg-white/5 backdrop-blur-lg", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    {t("dashboard.usage.title") || "Usage & Quota"}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{t("dashboard.usage.monthly") || "Monthly Credits"}</span>
                            <span className="font-mono">{profile.usage_count} / {profile.usage_limit}</span>
                        </div>
                        <Progress value={usagePercent} className="h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                                <Database className="h-3 w-3" />
                                {t("dashboard.usage.plan") || "Plan"}
                            </div>
                            <div className={`font-semibold capitalize text-sm ${isPro ? 'text-emerald-400' : 'text-white'}`}>
                                {profile.tier}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                                <Zap className="h-3 w-3 text-blue-400" />
                                {t("dashboard.usage.extra") || "Extra"}
                            </div>
                            <div className="font-semibold text-blue-400 text-sm">
                                {profile.extra_credits}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
