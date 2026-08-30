import { track } from "@vercel/analytics"
import type { Locale } from "@/lib/i18n"

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

type GrowthEventPayloads = {
  library_view: { locale: Locale }
  library_digest_open: { locale: Locale; source: string; area: EpisodePlacement }
  library_filter_source: { locale: Locale; source: string }
  library_load_more: { locale: Locale; source: string; page: number }
  public_digest_view: { locale: Locale; source: string }
  public_digest_share: { locale: Locale; source: string; method: "copy_link" }
  quota_pricing_open: { locale: Locale; surface: "workspace" | "source_followup" }
}

export type GrowthEventName = keyof GrowthEventPayloads

export function trackGrowthEvent<Name extends GrowthEventName>(
  name: Name,
  payload: GrowthEventPayloads[Name],
) {
  track(name, payload)
}
