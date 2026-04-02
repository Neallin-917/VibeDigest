import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/env'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export const createClient = () => {
    if (browserClient) {
        return browserClient
    }

    browserClient = createBrowserClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    return browserClient
}
