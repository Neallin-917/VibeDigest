import catalogJson from "@/generated/customer-plan-catalog.json"

export type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string

type BillingOption = {
  planKey: string
  price: number
  billingPeriodMonths: number
}

type PlanFeature =
  | "save_notes"
  | "multilingual_summaries"
  | "everything_in_basic"

type CustomerPlanCatalog = {
  currency: "USD"
  plans: {
    basic: {
      key: "basic"
      name: string
      price: number
      includedVideosPerMonth: number
      features: PlanFeature[]
    }
    pro: {
      key: "pro"
      name: string
      includedVideosPerMonth: number
      features: PlanFeature[]
      billingOptions: {
        monthly: BillingOption
        annual: BillingOption
      }
    }
  }
  topUps: {
    videoCredits: {
      key: string
      name: string
      planKey: string
      price: number
      credits: number
      expires: boolean
      compatiblePlanKeys: string[]
    }
  }
}

export const customerPlanCatalog = catalogJson as CustomerPlanCatalog

function formatUsd(amount: number, fractionDigits: number): string {
  return `$${amount.toFixed(fractionDigits)}`
}

export function getCustomerPlanDisplay(t: Translator) {
  const { basic, pro } = customerPlanCatalog.plans
  const topUp = customerPlanCatalog.topUps.videoCredits
  const monthly = pro.billingOptions.monthly
  const annual = pro.billingOptions.annual
  const annualEffectiveMonthly = annual.price / annual.billingPeriodMonths
  const featureLabels: Record<PlanFeature, string> = {
    save_notes: t("pricing.features.saveNotes"),
    multilingual_summaries: t("pricing.features.multilingualSummaries"),
    everything_in_basic: t("pricing.features.everythingInBasic"),
  }
  const localizeFeatures = (features: PlanFeature[]) =>
    features.map((feature) => featureLabels[feature])
  const compatibleWithAllPlans = Object.values(customerPlanCatalog.plans).every(
    (plan) => topUp.compatiblePlanKeys.includes(plan.key),
  )

  return {
    basic: {
      ...basic,
      title: t("pricing.free.title"),
      priceLabel: formatUsd(basic.price, 0),
      description: t("pricing.free.desc"),
      features: [
        t("pricing.features.monthlyVideos", {
          count: basic.includedVideosPerMonth,
        }),
        ...localizeFeatures(basic.features),
      ],
    },
    pro: {
      ...pro,
      title: t("pricing.pro.title"),
      description: t("pricing.pro.desc", {
        price: formatUsd(annual.price, 0),
      }),
      monthlyPriceLabel: formatUsd(monthly.price, 2),
      annualPriceLabel: formatUsd(annual.price, 0),
      annualEffectiveMonthlyLabel: formatUsd(annualEffectiveMonthly, 2),
      features: [
        t("pricing.features.monthlyVideos", {
          count: pro.includedVideosPerMonth,
        }),
        ...localizeFeatures(pro.features),
      ],
    },
    topUp: {
      ...topUp,
      title: t("pricing.topup.title"),
      priceLabel: formatUsd(topUp.price, 2),
      description: t("pricing.topup.desc"),
      features: [
        t("pricing.features.topUpVideos", { count: topUp.credits }),
        ...(!topUp.expires ? [t("pricing.features.neverExpires")] : []),
        ...(compatibleWithAllPlans ? [t("pricing.features.anyPlan")] : []),
      ],
    },
  }
}

export function getPlanCopyVariables(t: Translator) {
  const { basic, pro } = customerPlanCatalog.plans
  const topUp = customerPlanCatalog.topUps.videoCredits
  const annual = pro.billingOptions.annual

  return {
    basicPlan: t("pricing.free.title"),
    basicQuota: basic.includedVideosPerMonth,
    proPlan: t("pricing.pro.title"),
    proQuota: pro.includedVideosPerMonth,
    monthlyPrice: formatUsd(pro.billingOptions.monthly.price, 2),
    annualPrice: formatUsd(annual.price, 0),
    annualMonthlyPrice: formatUsd(annual.price / annual.billingPeriodMonths, 2),
    topUpPrice: formatUsd(topUp.price, 2),
    topUpCredits: topUp.credits,
  }
}
