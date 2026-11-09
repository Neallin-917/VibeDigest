"use client"

import { ArrowUpRight } from "lucide-react"
import { FeedbackDialog } from "@/components/layout/FeedbackDialog"
import { BrandLogo } from "@/components/layout/BrandLogo"
import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading } from "@/components/ui/typography"
import { Faq } from "@/components/ui/rare/faq"
import { getLandingFaqItems } from "@/lib/billing/faq-content"

export function LandingFAQ() {
    const { t } = useI18n()
    const items = getLandingFaqItems(t).map((item, index) => ({ ...item, id: String(index) }))

    return (
        <section id="landing-faq" aria-labelledby="landing-faq-title" className="scroll-mt-6 px-5 pt-12 sm:px-6 md:pt-24 lg:px-10 xl:px-6">
            <div className="mx-auto grid max-w-[992px] gap-8 md:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] md:gap-16">
                <div className="flex items-center justify-between gap-5 md:block">
                    <Heading id="landing-faq-title" as="h2" className="text-[25px] sm:text-[30px] font-semibold leading-tight tracking-[-0.038em] text-foreground">
                        {t("landing.faqTitle")}
                    </Heading>
                    <FeedbackDialog defaultCategory="support">
                        <button type="button" className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary-strong hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-primary md:mt-6">
                            {t("landing.contactSupport")} <ArrowUpRight className="size-4" aria-hidden="true" />
                        </button>
                    </FeedbackDialog>
                </div>
                <Faq items={items} defaultValue="0" accent="#466c50" avatar={<BrandLogo showText={false} />} className="landing-faq-bubbles max-w-none gap-[18px]" />
            </div>
        </section>
    )
}
