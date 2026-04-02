import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * A stable Supabase client for public data fetching.
 * Does NOT depend on cookies or next/headers, making it safe for use in
 * background tasks, sitemaps, and other non-request contexts.
 */
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey)
