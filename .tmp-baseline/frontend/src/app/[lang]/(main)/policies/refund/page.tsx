"use client"

import { useI18n } from "@/components/i18n/I18nProvider"
import { PageContainer } from "@/components/layout/PageContainer"
import { Heading, Text } from "@/components/ui/typography"

export default function RefundPolicy() {
    const { t } = useI18n()

    return (
        <PageContainer>
            <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
                <Heading as="h1" variant="h1">
                    {t("policies.refund.title")}
                </Heading>
                <Text tone="muted" variant="bodySm">
                    {t("policies.common.lastUpdated")}
                </Text>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.refund.general.title")}
                    </Heading>
                    <p dangerouslySetInnerHTML={{ __html: t("policies.refund.general.content") }} />
                </section>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.refund.crypto.title")}
                    </Heading>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500">
                        <p className="font-semibold">{t("policies.refund.crypto.noticeTitle")}</p>
                        <p className="text-sm mt-1">{t("policies.refund.crypto.noticeContent")}</p>
                    </div>
                    <ul className="list-disc pl-5 space-y-2">
                        <li dangerouslySetInnerHTML={{ __html: t("policies.refund.crypto.list.noRefunds") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("policies.refund.crypto.list.networkErrors") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("policies.refund.crypto.list.underpayments") }} />
                        <li dangerouslySetInnerHTML={{ __html: t("policies.refund.crypto.list.gas") }} />
                    </ul>
                </section>

                <section className="space-y-4">
                    <Heading as="h2" variant="h2" className="font-semibold">
                        {t("policies.common.contactTitle")}
                    </Heading>
                    <p>
                        {t("policies.common.contactRefundText")}
                        <a href="mailto:support@vibedigest.com" className="text-blue-500 hover:underline ml-1">support@vibedigest.com</a>
                    </p>
                </section>
            </div>
        </PageContainer>
    )
}
