"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"
import { cn } from "@/lib/utils"
import { FileText, MessageSquare, Sparkles, type LucideIcon } from "lucide-react"

type FeatureCardProps = {
    icon: LucideIcon
    title: string
    desc: string
    className?: string
}

function FeatureCard({ icon: Icon, title, desc, className = "" }: FeatureCardProps) {
    return (
        <article
            className={cn(
                "group rounded-3xl border border-slate-200 bg-white p-6 transition-colors duration-200 hover:border-emerald-200 hover:bg-emerald-50/30 dark:border-white/10 dark:bg-zinc-950 dark:hover:border-emerald-400/30 dark:hover:bg-emerald-400/[0.035]",
                className,
            )}
        >
            <div className="flex flex-col gap-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-emerald-700 dark:bg-white/10 dark:text-emerald-300">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                    <Heading as="h3" className="text-base font-bold text-slate-900 dark:text-white">
                        {title}
                    </Heading>
                    <Text className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                        {desc}
                    </Text>
                </div>
            </div>
        </article>
    )
}

export function FeaturesSection() {
    const { t } = useI18n()
    const features = [
        {
            icon: Sparkles,
            title: t("landing.smartSummarization"),
            desc: t("landing.smartSummarizationDesc"),
        },
        {
            icon: FileText,
            title: t("landing.dynamicTemplates"),
            desc: t("landing.dynamicTemplatesDesc"),
        },
        {
            icon: MessageSquare,
            title: t("landing.chatWithVideo"),
            desc: t("landing.chatWithVideoDesc"),
        },
    ]

    return (
        <section id="features" className="relative scroll-mt-24 px-6 py-20">
            <div className="mx-auto max-w-6xl">
                <div className="mb-12 max-w-2xl">
                    <Heading as="h2" className="mb-5 font-display text-2xl font-bold text-slate-900 md:text-4xl dark:text-white">
                        {t("landing.featuresTitlePrefix")} <span className="text-emerald-700 dark:text-emerald-300">{t("landing.featuresTitleEmphasis")}</span>
                    </Heading>
                    <Text className="max-w-xl text-base text-slate-600 dark:text-zinc-400">
                        {t("landing.featuresSubtitle")}
                    </Text>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {features.map((feature) => (
                        <FeatureCard key={feature.title} {...feature} />
                    ))}
                </div>
            </div>
        </section>
    )
}
