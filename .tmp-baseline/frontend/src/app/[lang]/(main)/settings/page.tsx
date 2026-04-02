"use client"

import { LanguageDropdown } from "@/components/i18n/LanguageDropdown"
import { useI18n } from "@/components/i18n/I18nProvider"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Heading, Text } from "@/components/ui/typography"
import { useTaskNotification } from "@/hooks/useTaskNotification"
import { Button } from "@/components/ui/button"
import { Bell, BellOff } from "lucide-react"

export default function SettingsPage() {
    const { t } = useI18n()

    return (
        <PageContainer>
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="space-y-1">
                    <Heading as="h1" variant="pageTitle">
                        {t("settings.title")}
                    </Heading>
                    <Text tone="muted">
                        {t("settings.subtitle")}
                    </Text>
                </div>

                <div className="grid gap-6">
                    <Card className="overflow-visible">
                        <CardContent className="space-y-6 pt-6">
                            {/* Language Section */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-foreground">
                                        {t("settings.language")}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t("settings.languageHint")}
                                    </p>
                                </div>
                                <div className="w-full md:w-[200px]">
                                    <LanguageDropdown />
                                </div>
                            </div>

                            <Separator />

                            {/* Notification Section */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-foreground">
                                        {t("settings.notifications")}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t("settings.notificationsHint")}
                                    </p>
                                </div>
                                <div>
                                    <NotificationSettings />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageContainer>
    )
}

function NotificationSettings() {
    const { t } = useI18n()
    const { permission, requestPermission } = useTaskNotification()

    const handleRequest = async () => {
        await requestPermission()
    }

    if (permission === 'granted') {
        return (
            <div className="flex items-center gap-3 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10 px-4 py-3 rounded-lg border border-green-200 dark:border-green-500/20">
                <Bell className="h-5 w-5" />
                <span className="font-medium">{t("tasks.notificationEnabled")}</span>
            </div>
        )
    }

    if (permission === 'denied') {
        return (
            <div className="flex items-center gap-3 text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-500/10 px-4 py-3 rounded-lg border border-red-200 dark:border-red-500/20">
                <BellOff className="h-5 w-5" />
                <span className="font-medium">{t("tasks.notificationPermissionDenied")}</span>
            </div>
        )
    }

    return (
        <Button variant="outline" onClick={handleRequest} className="gap-2">
            <Bell className="h-4 w-4" />
            {t("tasks.enableNotifications")}
        </Button>
    )
}
