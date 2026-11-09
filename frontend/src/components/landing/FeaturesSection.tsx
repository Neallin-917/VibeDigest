"use client"

import { useI18n } from "@/components/i18n/I18nProvider"

export function FeaturesSection() {
    const { t } = useI18n()

    return (
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-24 lg:px-10 xl:px-6">
            <div className="mx-auto max-w-[992px]">
                <h2 id="features-heading" className="mb-7 text-[25px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[32px]">
                    {t("landing.featuresTitlePrefix")}
                </h2>
                <div className="grid gap-8 border-y border-border py-8 md:grid-cols-3 md:gap-0 md:py-10">
                    {(["Read", "Verify", "Ask"] as const).map((feature, index) => (
                        <div key={feature} className="min-w-0 md:border-l md:border-border md:px-8 md:first:border-0 md:first:pl-0 md:last:pr-0">
                            <span aria-hidden="true" className="mb-5 block text-2xl text-primary">{["≡", "↗", "↳"][index]}</span>
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
