"use client"

import { useI18n } from "@/components/i18n/I18nProvider"

export default function Loading() {
    const { t } = useI18n()

    return (
        <div
            role="status"
            aria-live="polite"
            className="flex min-h-[50vh] items-center justify-center px-6 text-sm text-muted-foreground"
        >
            {t("tasks.loadingTask")}
        </div>
    )
}
