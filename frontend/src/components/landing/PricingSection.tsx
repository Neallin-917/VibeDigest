"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import Link from "next/link"
import { getCustomerPlanDisplay, getPlanCopyVariables } from "@/lib/billing/plan-catalog"
import { trackGrowthEvent } from "@/lib/growth-events"

type PricingPlanKey = "pro" | "free" | "topup"
function getPlanDestination(locale: string, plan: PricingPlanKey) {
    if (plan === "free") return `/${locale}/chat`
    return `/${locale}/settings/pricing#${plan}`
}

export function PricingSection() {
    const { t, locale } = useI18n()
    const router = useRouter()
    const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual")
    const { data: user, refetch: refetchUser } = useCurrentUserQuery()

    const handlePlanClick = async (plan: PricingPlanKey) => {
        const destination = getPlanDestination(locale, plan)
        const resolvedUser = user === undefined
            ? (await refetchUser()).data
            : user

        if (!resolvedUser) {
            trackGrowthEvent("pricing_plan_open", {
                locale,
                plan,
                destination: "login",
            })
            router.push(`/${locale}/login?next=${encodeURIComponent(destination)}`)
        } else {
            trackGrowthEvent("pricing_plan_open", {
                locale,
                plan,
                destination: plan === "free" ? "chat" : "pricing",
            })
            router.push(destination)
        }
    }

    const catalog = getCustomerPlanDisplay(t)
    const planVars = getPlanCopyVariables(t)

    const annual = billingPeriod === "annual"
    const plans = [
        { ...catalog.basic, key: "free" as const, price: catalog.basic.priceLabel, billing: catalog.basic.description, cta: t("landing.getStarted") },
        { ...catalog.pro, key: "pro" as const, price: annual ? catalog.pro.annualEffectiveMonthlyLabel : catalog.pro.monthlyPriceLabel, billing: annual ? t("landing.proAnnualBilling", planVars) : t("landing.proMonthlyBilling"), cta: t("landing.viewPlan") },
    ]

    return (
        <section id="pricing" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-24 lg:px-10 xl:px-6">
            <div className="mx-auto max-w-[1080px]">
                <div className="mb-7 max-w-2xl">
                    <Heading as="h2" className="text-[25px] sm:text-[32px] font-semibold leading-tight tracking-[-0.038em] text-foreground">
                        {t("landing.simplePricing")}
                    </Heading>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.15fr]">
                    {plans.map((plan) => (
                        <article key={plan.key} className={cn(
                            "flex flex-col rounded-xl border p-6 md:p-[30px]",
                            plan.key === "pro" ? "border-border-strong bg-surface-subtle" : "border-border bg-surface"
                        )}>
                            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
                                <Heading as="h3" className="text-[19px] font-semibold text-foreground">{plan.title}</Heading>
                                {plan.key === "pro" && (
                                    <div role="group" aria-label={t("pricing.billingPeriod")} className="flex gap-1 rounded-lg border border-border-strong p-[3px]">
                                        {(["monthly", "annual"] as const).map((period) => (
                                            <button key={period} type="button" aria-pressed={billingPeriod === period}
                                                onClick={() => setBillingPeriod(period)}
                                                className={cn("min-h-9 rounded-[5px] px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                                                    billingPeriod === period ? "bg-background text-foreground shadow-sm" : "text-foreground-soft hover:text-foreground")}
                                            >{t(`pricing.pro.${period}`)}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div aria-live={plan.key === "pro" ? "polite" : undefined} aria-atomic="true" className="mt-5">
                                <p className="flex flex-wrap items-baseline gap-2">
                                    <span className="text-[40px] font-semibold leading-tight tracking-[-0.035em] text-foreground">{plan.price}</span>
                                    {plan.key === "pro" && <span className="text-[13px] text-foreground-soft">{t("pricing.pro.unit")}</span>}
                                </p>
                                <p className="mt-2 min-h-6 text-xs leading-relaxed text-foreground-soft">{plan.billing}</p>
                            </div>
                            <p className="mb-[22px] mt-[18px] text-[13px] font-medium text-foreground">{plan.features[0]}</p>
                            <Button variant={plan.key === "pro" ? "default" : "outline"}
                                onClick={() => handlePlanClick(plan.key)}
                                className={cn("mt-auto min-h-11 w-full rounded-[9px] text-[13px] font-semibold",
                                    plan.key === "pro" ? "bg-primary-strong text-primary-foreground hover:bg-primary" : "border-border bg-transparent text-foreground hover:bg-secondary")}
                            >{plan.cta}<ArrowRight className="size-4" aria-hidden="true" /></Button>
                        </article>
                    ))}
                </div>
                <div className="mt-[18px] flex flex-col items-start justify-between gap-3 border-b border-border px-1 py-[18px] sm:flex-row sm:items-center sm:gap-6">
                    <p className="text-[13px] leading-relaxed text-foreground-soft">
                        <strong className="mr-2 font-semibold text-foreground">{catalog.topUp.title}</strong>
                        <span>{catalog.topUp.priceLabel} · {catalog.topUp.features.join(" · ")}</span>
                    </p>
                    <Button variant="link" onClick={() => handlePlanClick("topup")} className="h-auto shrink-0 px-0 py-2 text-[13px] font-semibold text-primary-strong">
                        {t("pricing.topup.button")}<ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                </div>
                <p className="mt-6 max-w-xl text-xs leading-relaxed text-foreground-subtle">
                    {t("landing.pricingPolicyPrefix")} {" "}
                    <Link href={`/${locale}/policies/refund`} className="underline underline-offset-2 hover:text-foreground-soft focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                        {t("pricing.policies.refund")}
                    </Link>
                    {" "}{t("landing.pricingPolicyConnector")} {" "}
                    <Link href={`/${locale}/policies/terms`} className="underline underline-offset-2 hover:text-foreground-soft focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                        {t("pricing.policies.terms")}
                    </Link>.
                </p>
            </div>
        </section>
    )
}
