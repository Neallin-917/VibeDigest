"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useCurrentUserQuery } from "@/hooks/useAccountQueries"
import Link from "next/link"

export function PricingSection() {
    const { t, locale } = useI18n()
    const router = useRouter()
    const { data: user, refetch: refetchUser } = useCurrentUserQuery()

    const handlePlanClick = async () => {
        const resolvedUser = user === undefined
            ? (await refetchUser()).data
            : user

        if (!resolvedUser) {
            router.push(`/${locale}/login?next=/${locale}/settings/pricing`)
        } else {
            router.push(`/${locale}/settings/pricing`)
        }
    }

    const freeFeatureKeys = [
        "pricing.free.features.f1",
        "pricing.free.features.f4",
        "pricing.free.features.f5",
    ] as const

    const proFeatureKeys = [
        "pricing.pro.features.f1",
        "pricing.pro.features.f2",
    ] as const

    const topupFeatureKeys = [
        "pricing.topup.features.f1",
        "pricing.topup.features.f2",
        "pricing.topup.features.f3",
    ] as const

    const plans = [
        {
            key: "free",
            title: t("pricing.free.title"),
            price: t("pricing.free.price"),
            desc: t("pricing.free.desc"),
            features: freeFeatureKeys.map(k => t(k)),
            cta: t("landing.getStarted"),
            highlight: false
        },
        {
            key: "pro",
            title: t("pricing.pro.title"),
            price: t("pricing.pro.annualPrice"),
            desc: t("landing.proAnnualBilling"),
            features: proFeatureKeys.map(k => t(k)),
            cta: t("landing.viewPlan"),
            highlight: true
        },
        {
            key: "topup",
            title: t("pricing.topup.title"),
            price: t("pricing.topup.price"),
            desc: t("pricing.topup.desc"),
            features: topupFeatureKeys.map(k => t(k)),
            cta: t("pricing.topup.button"),
            highlight: false
        }
    ]

    return (
        <section id="pricing" className="px-6 py-20 scroll-mt-24">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <div>
                        <Heading as="h2" className="text-2xl md:text-4xl font-bold mb-5 font-display text-slate-900 dark:text-white">
                            {t("landing.simplePricing")}
                        </Heading>
                        <Text className="text-slate-600 dark:text-zinc-400 text-base">
                            {t("landing.simplePricingSubtitle")}
                        </Text>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {plans.map((plan) => (
                        <div
                            key={plan.key}
                            className={cn(
                                "relative flex flex-col rounded-2xl border p-6 transition-colors duration-200",
                                plan.highlight
                                    ? cn(
                                        // Light mode highlight
                                        "border-emerald-600 bg-white shadow-sm md:-mt-3 md:mb-3 z-10",
                                        // Dark mode highlight
                                        "dark:border-emerald-400 dark:bg-zinc-900 dark:shadow-none"
                                    )
                                    : cn(
                                        // Light mode normal
                                        "border-slate-200 bg-white hover:border-slate-300",
                                        // Dark mode normal
                                        "dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
                                    )
                            )}
                        >
                            {plan.highlight && (
                                <div className={cn(
                                    "absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-emerald-800 px-3 py-1 text-[10px] font-bold tracking-wider text-white",
                                    "dark:bg-emerald-400 dark:text-zinc-950"
                                )}>
                                    <Zap className="w-2.5 h-2.5 fill-current" />
                                    {t("landing.mostPopular")}
                                </div>
                            )}

                            <Heading as="h3" className={cn(
                                "text-base font-bold mb-1",
                                plan.highlight ? "text-emerald-800 dark:text-emerald-400" : "text-slate-800 dark:text-zinc-100"
                            )}>
                                {plan.title}
                            </Heading>

                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">{plan.price}</span>
                                {plan.key === 'pro' && <span className="text-xs text-slate-500 dark:text-zinc-500">{t("landing.effectiveMonthly")}</span>}
                            </div>

                            <Text className="text-slate-600 dark:text-zinc-400 mb-6 leading-relaxed text-xs min-h-[32px]">
                                {plan.desc}
                            </Text>

                            <ul className="space-y-3 mb-6 flex-1">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-zinc-300">
                                        <CheckCircle2 className={cn(
                                            "w-4 h-4 shrink-0 mt-0.5",
                                            plan.highlight ? "text-emerald-700 dark:text-emerald-500" : "text-slate-400 dark:text-zinc-600"
                                        )} />
                                        <span className="leading-snug">{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <Button
                                variant={plan.highlight ? "default" : "outline"}
                                onClick={handlePlanClick}
                                className={cn(
                                    "w-full h-10 rounded-lg font-semibold text-sm transition-all duration-300",
                                    plan.highlight
                                        ? cn(
                                            "border-0 bg-emerald-800 text-white hover:bg-emerald-900 active:translate-y-px",
                                            "dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                                        )
                                        : cn(
                                            "bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700 hover:text-slate-900",
                                            "dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:text-white"
                                        )
                                )}
                            >
                                {plan.cta}
                            </Button>
                        </div>
                    ))}
                </div>
                <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-slate-500 dark:text-zinc-500">
                    {t("landing.pricingPolicyPrefix")} {" "}
                    <Link href={`/${locale}/policies/refund`} className="underline underline-offset-2 hover:text-slate-700 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:hover:text-zinc-300 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-zinc-950">
                        {t("pricing.policies.refund")}
                    </Link>
                    {" "}{t("landing.pricingPolicyConnector")} {" "}
                    <Link href={`/${locale}/policies/terms`} className="underline underline-offset-2 hover:text-slate-700 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:hover:text-zinc-300 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-zinc-950">
                        {t("pricing.policies.terms")}
                    </Link>.
                </p>
            </div>
        </section>
    )
}
