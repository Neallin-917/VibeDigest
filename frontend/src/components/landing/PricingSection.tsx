"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import Link from "next/link"
import { getCustomerPlanDisplay, getPlanCopyVariables } from "@/lib/billing/plan-catalog"
import { trackGrowthEvent } from "@/lib/growth-events"

type PricingPlanKey = "pro" | "free" | "topup"
type PricingPlanCard = {
    key: PricingPlanKey
    title: string
    price: string
    desc: string
    features: string[]
    cta: string
    highlight: boolean
}

function getPlanDestination(locale: string, plan: PricingPlanKey) {
    if (plan === "free") return `/${locale}/chat`
    return `/${locale}/settings/pricing#${plan}`
}

export function PricingSection() {
    const { t, locale } = useI18n()
    const router = useRouter()
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

    const plans: PricingPlanCard[] = [
        {
            key: "pro",
            title: catalog.pro.title,
            price: catalog.pro.annualEffectiveMonthlyLabel,
            desc: t("landing.proAnnualBilling", planVars),
            features: catalog.pro.features,
            cta: t("landing.viewPlan"),
            highlight: true
        },
        {
            key: "free",
            title: catalog.basic.title,
            price: catalog.basic.priceLabel,
            desc: catalog.basic.description,
            features: catalog.basic.features,
            cta: t("landing.getStarted"),
            highlight: false
        },
        {
            key: "topup",
            title: catalog.topUp.title,
            price: catalog.topUp.priceLabel,
            desc: catalog.topUp.description,
            features: catalog.topUp.features,
            cta: t("pricing.topup.button"),
            highlight: false
        }
    ]

    return (
        <section id="pricing" className="scroll-mt-24 px-4 py-20 sm:px-6 md:py-24 lg:px-10 lg:py-28 xl:px-6">
            <div className="mx-auto max-w-[1080px]">
                <div className="mb-12 max-w-2xl">
                    <Heading as="h2" className="text-[clamp(2rem,3.4vw,2.5rem)] font-semibold leading-tight tracking-[-0.038em] text-foreground">
                        {t("landing.simplePricing")}
                    </Heading>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {plans.map((plan) => (
                        <div
                            key={plan.key}
                            className={cn(
                                "relative flex flex-col rounded-[12px] border p-6 transition-colors duration-200 md:p-8",
                                plan.highlight
                                    ? cn(
                                        "border-border-strong bg-accent/65 md:col-span-2"
                                    )
                                    : cn(
                                        "border-border bg-card/45 hover:border-border-strong"
                                    )
                            )}
                        >
                            {plan.highlight && (
                                <div className="absolute right-6 top-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-strong md:right-8 md:top-8">
                                    <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                                    {t("landing.mostPopular")}
                                </div>
                            )}

                            <Heading as="h3" className={cn(
                                "mb-2 pr-28 text-base font-semibold",
                                plan.highlight ? "text-primary-strong" : "text-foreground"
                            )}>
                                {plan.title}
                            </Heading>

                            <div className="mb-4 flex items-baseline gap-2">
                                <span className={cn(
                                    "font-semibold tracking-[-0.035em] text-foreground",
                                    plan.highlight ? "text-[2.5rem]" : "text-[2rem]",
                                )}>
                                    {plan.price}
                                </span>
                                {plan.key === 'pro' && <span className="text-xs text-foreground-subtle">{t("landing.effectiveMonthly")}</span>}
                            </div>

                            <Text className={cn(
                                "mb-6 leading-relaxed text-muted-foreground",
                                plan.highlight ? "max-w-xl text-sm" : "min-h-[32px] text-xs",
                            )}>
                                {plan.desc}
                            </Text>

                            <div className={cn(
                                "flex flex-1 flex-col gap-6",
                                plan.highlight && "lg:flex-row lg:items-end lg:justify-between",
                            )}>
                                <ul className={cn(
                                    "space-y-3",
                                    plan.highlight && "lg:max-w-sm",
                                )}>
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[12px] text-foreground-soft">
                                        <CheckCircle2 className={cn(
                                            "w-4 h-4 shrink-0 mt-0.5",
                                            plan.highlight ? "text-primary" : "text-foreground-subtle"
                                        )} />
                                        <span className="leading-snug">{feature}</span>
                                    </li>
                                ))}
                                </ul>

                                <Button
                                    variant={plan.highlight ? "default" : "outline"}
                                    onClick={() => handlePlanClick(plan.key)}
                                    className={cn(
                                        "min-h-11 rounded-[9px] font-semibold text-[13px] transition-[background-color,color,border-color,transform] duration-200",
                                        plan.highlight
                                            ? "w-full border-0 bg-primary-strong text-primary-foreground hover:bg-primary active:translate-y-px lg:w-auto lg:min-w-[11rem]"
                                            : "w-full border-border bg-muted text-foreground-soft hover:bg-secondary hover:text-foreground"
                                    )}
                                >
                                    {plan.cta}
                                </Button>
                            </div>
                        </div>
                    ))}
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
