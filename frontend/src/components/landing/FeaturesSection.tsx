"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"

export function FeaturesSection() {
    const { t } = useI18n()
    const features = [
        {
            title: t("landing.smartSummarization"),
            desc: t("landing.smartSummarizationDesc"),
            output: t("landing.outputSummary"),
        },
        {
            title: t("landing.dynamicTemplates"),
            desc: t("landing.dynamicTemplatesDesc"),
            output: t("landing.outputKeyIdeas"),
        },
        {
            title: t("landing.chatWithVideo"),
            desc: t("landing.chatWithVideoDesc"),
            output: t("landing.outputFollowUp"),
        },
    ]

    return (
        <section id="features" className="scroll-mt-24 px-4 py-20 sm:px-6 md:py-24 lg:px-10 lg:py-28 xl:px-6">
            <div className="mx-auto grid max-w-[1080px] gap-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(28rem,1.18fr)] lg:gap-20">
                <div className="lg:sticky lg:top-28 lg:self-start">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-strong">02 · {t("landing.featuresEyebrow")}</p>
                    <Heading as="h2" className="mt-5 max-w-lg text-[clamp(2rem,3.4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.038em] text-foreground">
                        {t("landing.featuresTitlePrefix")} {" "}
                        <span className="text-primary">{t("landing.featuresTitleEmphasis")}</span>
                    </Heading>
                    <Text className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
                        {t("landing.featuresSubtitle")}
                    </Text>
                </div>

                <ol className="border-t border-border">
                    {features.map((feature, index) => (
                        <li key={feature.title} className="group grid gap-5 border-b border-border py-7 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:py-8">
                            <span className="text-[11px] font-semibold text-primary-muted transition-transform duration-200 motion-safe:group-hover:translate-x-1">
                                0{index + 1}
                            </span>
                            <div>
                                <div className="flex flex-wrap items-baseline justify-between gap-3">
                                    <Heading as="h3" className="text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl">
                                        {feature.title}
                                    </Heading>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle">
                                        {feature.output}
                                    </span>
                                </div>
                                <Text className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                                    {feature.desc}
                                </Text>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    )
}
