"use client"

import { useI18n } from "@/components/i18n/I18nProvider"

export function FeaturesSection() {
    const { t } = useI18n()

    return (
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-20 lg:px-10 xl:px-6">
            <div className="mx-auto max-w-[1080px]">
                <h2 id="features-heading" className="mb-7 text-[25px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[32px]">
                    {t("landing.featuresTitlePrefix")}
                </h2>
                <div className="grid gap-7 md:grid-cols-3 md:gap-10">
                    {(["Read", "Verify", "Ask"] as const).map((feature) => (
                        <div key={feature} className="min-w-0">
                            <h3 className="text-base font-semibold text-foreground">
                                {t(`landing.feature${feature}Title`)}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-foreground-soft">
                                {t(`landing.feature${feature}Description`)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
