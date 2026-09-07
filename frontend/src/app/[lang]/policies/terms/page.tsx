"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { Heading, Text } from "@/components/ui/typography"

export default function TermsOfService() {
    const { t } = useI18n()

    return (
        <div className="px-4 sm:px-6">
            <div className="max-w-3xl mx-auto py-6 sm:py-10 space-y-6">
                <Heading as="h1" variant="h1">
                    {t("policies.terms.title")}
                </Heading>
                <Text tone="muted" variant="bodySm">
                    {t("policies.common.lastUpdated")}
                </Text>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.terms.service.title")}
                    </Heading>
                    <p>
                        {t("policies.terms.service.content")}
                    </p>
                </section>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.terms.payments.title")}
                    </Heading>
                    <p>
                        {t("policies.terms.payments.content")}
                    </p>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                        <li>{t("policies.terms.payments.list.l1")}</li>
                        <li>{t("policies.terms.payments.list.l2")}</li>
                        <li>{t("policies.terms.payments.list.l3")}</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.terms.responsibilities.title")}
                    </Heading>
                    <p>
                        {t("policies.terms.responsibilities.content")}
                    </p>
                </section>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.common.contactTitle")}
                    </Heading>
                    <p>
                        {t("policies.common.contactText")}
                        <a href="mailto:support@vibedigest.io" className="text-primary-strong hover:underline ml-1">support@vibedigest.io</a>
                    </p>
                </section>
            </div>
        </div>
    )
}
