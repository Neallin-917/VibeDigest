import { env } from '@/env'

/**
 * A local visual test harness. It is intentionally unavailable from a
 * production build, so the application data plane remains Supabase + FastAPI.
 */
export function isLocalUiDemo() {
  return process.env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_LOCAL_DEMO === '1'
}

/**
 * Keeps local visual review and Playwright smoke independent from a Supabase
 * project. Production can never use these fixtures.
 */
export function shouldUseDemoFixtures() {
  return process.env.NODE_ENV !== 'production' && (
    env.NEXT_PUBLIC_LOCAL_DEMO === '1' || env.NEXT_PUBLIC_E2E_MOCK === '1'
  )
}
