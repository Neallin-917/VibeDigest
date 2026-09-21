import { useQuery } from "@tanstack/react-query"
import type { User } from "@supabase/supabase-js"

import { customerPlanCatalog } from "@/lib/billing/plan-catalog"

import { createClient } from "@/lib/supabase"

export interface AccountProfile {
    tier: "free" | "pro" | string
    usage_count: number
    usage_limit: number
    extra_credits: number
    billing_interval?: "monthly" | "annual" | null
    cancel_at_period_end?: boolean | null
    period_end?: string | null
    usage_reset_at?: string | null
}

export const FREE_ACCOUNT_PROFILE: AccountProfile = {
    tier: "free",
    usage_count: 0,
    usage_limit: customerPlanCatalog.plans.basic.includedVideosPerMonth,
    extra_credits: 0,
}

// Display-only projection of the server's lazy quota/expiry reconciliation.
export function projectAccountProfile(profile: AccountProfile, now = Date.now()): AccountProfile {
    if (profile.tier === "pro" && profile.period_end && Date.parse(profile.period_end) <= now) {
        return { ...profile, tier: "free", usage_limit: customerPlanCatalog.plans.basic.includedVideosPerMonth, usage_count: 0 }
    }
    if (profile.usage_reset_at && Date.parse(profile.usage_reset_at) <= now) {
        return { ...profile, usage_count: 0 }
    }
    return profile
}

export const accountKeys = {
    currentUser: ["account", "current-user"] as const,
    profiles: ["account", "profile"] as const,
    profile: (userId: string) => ["account", "profile", userId] as const,
}

async function fetchCurrentUser(): Promise<User | null> {
    const supabase = createClient()
    const { data, error } = await supabase.auth.getUser()

    if (error?.name === "AuthSessionMissingError") {
        return null
    }

    if (error) {
        throw error
    }

    return data.user
}

async function fetchProfile(userId: string): Promise<AccountProfile> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("profiles")
        .select("tier, usage_count, usage_limit, extra_credits, billing_interval, cancel_at_period_end, period_end, usage_reset_at")
        .eq("id", userId)
        .single()

    if (error?.code === "PGRST116") {
        return FREE_ACCOUNT_PROFILE
    }

    if (error) {
        throw error
    }

    return projectAccountProfile(data as AccountProfile)
}

export function useCurrentUserQuery({ enabled = true }: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: accountKeys.currentUser,
        queryFn: fetchCurrentUser,
        enabled,
        staleTime: 60_000,
        refetchOnWindowFocus: true,
    })
}

export function useProfileQuery(userId: string | null | undefined) {
    return useQuery({
        queryKey: accountKeys.profile(userId ?? "anonymous"),
        queryFn: () => {
            if (!userId) {
                throw new Error("A user ID is required to load an account profile")
            }
            return fetchProfile(userId)
        },
        enabled: Boolean(userId),
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    })
}
