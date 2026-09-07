"use client"

import { useRouter } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { useI18n } from "@/components/i18n/I18nProvider"

export default function LoginModal() {
    const router = useRouter()
    const { t } = useI18n()

    return (
        <Dialog open={true} onOpenChange={() => router.back()}>
            <DialogContent className="w-[calc(100%-2rem)] border-border bg-card p-0 shadow-lg sm:max-w-md [&_[data-slot=dialog-close]]:right-2 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center">
                {/* Accessibility: Title is required by DialogContent, use VisuallyHidden if no visible title is desired in the wrapper */}
                <VisuallyHidden>
                    <DialogTitle>{t("auth.welcomeBack")}</DialogTitle>
                </VisuallyHidden>
                <LoginForm isModal />
            </DialogContent>
        </Dialog>
    )
}
