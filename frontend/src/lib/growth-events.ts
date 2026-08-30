import { track } from "@vercel/analytics"
import type { Locale } from "@/lib/i18n"
import type { SupportedSource } from "@/lib/urls"

type EpisodePlacement =
  | "hero"
  | "supporting"
  | "solo"
  | "standard"
  | "hero_cta"
  | "supporting_cta"
  | "solo_cta"
  | "standard_cta"
  | "compact"

type TaskCreateAcceptedSurface = "workspace" | "source_followup"
type PricingPlan = "pro" | "free" | "topup"
type PricingPlanDestination = "chat" | "login" | "pricing"
type PricingCheckoutProduct = "pro" | "topup"
type PricingCheckoutBilling = "monthly" | "annual" | "one_time"

type GrowthEventPayloads = {
  landing_agent_intent: {
    locale: Locale
    destination: "chat" | "login"
    source: SupportedSource
  }
  library_view: { locale: Locale }
  library_digest_open: { locale: Locale; source: string; area: EpisodePlacement }
  library_filter_source: { locale: Locale; source: string }
  library_load_more: { locale: Locale; source: string; page: number }
  public_digest_view: { locale: Locale; source: string }
  public_digest_share: { locale: Locale; source: string; method: "copy_link" }
  quota_pricing_open: { locale: Locale; surface: "workspace" | "source_followup" }
  task_create_accepted: { locale: Locale; surface: TaskCreateAcceptedSurface }
  task_result_view: { locale: Locale }
  pricing_plan_open: {
    locale: Locale
    plan: PricingPlan
    destination: PricingPlanDestination
  }
  pricing_checkout_redirect: {
    locale: Locale
    product: PricingCheckoutProduct
    billing: PricingCheckoutBilling
  }
}

export type GrowthEventName = keyof GrowthEventPayloads

export function trackGrowthEvent<Name extends GrowthEventName>(
  name: Name,
  payload: GrowthEventPayloads[Name],
) {
  try {
    track(name, payload)
  } catch {
    // Analytics is best-effort and must never interrupt product actions.
  }
}
