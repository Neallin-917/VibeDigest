"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

export function PricingSection() {
    const { t, locale } = useI18n()
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    const handlePlanClick = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
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
        "pricing.pro.features.f3",
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
            price: t("pricing.pro.price"),
            desc: t("pricing.pro.desc"),
            features: proFeatureKeys.map(k => t(k)),
            cta: t("pricing.pro.button"),
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
        <section id="pricing" className="bg-noise py-20 px-6 relative scroll-mt-24">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Heading as="h2" className="text-2xl md:text-4xl font-bold mb-5 font-display text-slate-900 dark:text-white">
                            {t("landing.simplePricing")}
                        </Heading>
                        <Text className="text-slate-600 dark:text-zinc-400 text-base">
                            {t("landing.simplePricingSubtitle")}
                        </Text>
                    </motion.div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -4, scale: 1.02 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={cn(
                                "relative p-6 rounded-2xl flex flex-col backdrop-blur-xl transition-all",
                                plan.highlight
                                    ? cn(
                                        // Light mode highlight
                                        "bg-white/90 border-2 border-emerald-500/30 shadow-2xl shadow-emerald-900/5 md:-mt-3 md:mb-3 z-10",
                                        // Dark mode highlight
                                        "dark:bg-zinc-900/80 dark:border dark:border-emerald-500/30 dark:shadow-[0_0_40px_-10px_rgba(16,185,129,0.2)]"
                                    )
                                    : cn(
                                        // Light mode normal
                                        "bg-white/60 border border-slate-200 hover:border-slate-300 shadow-lg",
                                        // Dark mode normal
                                        "dark:bg-zinc-900/40 dark:border-white/5 dark:hover:border-white/10 dark:shadow-none"
                                    )
                            )}
                        >
                            {plan.highlight && (
                                <div className={cn(
                                    "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold px-3 py-1 rounded-full tracking-wider uppercase shadow-lg flex items-center gap-1",
                                    "bg-gradient-to-r from-emerald-700 to-teal-700 text-white",
                                    "dark:from-emerald-500 dark:to-teal-500 dark:text-black"
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
                                {plan.key === 'pro' && <span className="text-xs text-slate-500 dark:text-zinc-500">{t("pricing.pro.unit")}</span>}
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
                                            "bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-900/10 border-0",
                                            "dark:from-emerald-500 dark:to-teal-500 dark:hover:from-emerald-400 dark:hover:to-teal-400 dark:text-black dark:shadow-emerald-500/20"
                                        )
                                        : cn(
                                            "bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700 hover:text-slate-900",
                                            "dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:text-white"
                                        )
                                )}
                            >
                                {plan.cta}
                            </Button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
