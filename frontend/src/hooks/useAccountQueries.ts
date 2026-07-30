import { useQuery } from "@tanstack/react-query"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase"

export interface AccountProfile {
    tier: "free" | "pro" | string
    usage_count: number
    usage_limit: number
    extra_credits: number
}

export const FREE_ACCOUNT_PROFILE: AccountProfile = {
    tier: "free",
    usage_count: 0,
    usage_limit: 3,
    extra_credits: 0,
}

export const accountKeys = {
    currentUser: ["account", "current-user"] as const,
    profiles: ["account", "profile"] as const,
    profile: (userId: string) => ["account", "profile", userId] as const,
}

async function fetchCurrentUser(): Promise<User | null> {
    const supabase = createClient()
    const { data, error } = await supabase.auth.getUser()

    if (error) {
        throw error
    }

    return data.user
}

async function fetchProfile(userId: string): Promise<AccountProfile> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from("profiles")
        .select("tier, usage_count, usage_limit, extra_credits")
        .eq("id", userId)
        .single()

    if (error?.code === "PGRST116") {
        return FREE_ACCOUNT_PROFILE
    }

    if (error) {
        throw error
    }

    return data as AccountProfile
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
