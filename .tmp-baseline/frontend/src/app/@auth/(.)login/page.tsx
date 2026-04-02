"use client"

import { useRouter } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

export default function LoginModal() {
    const router = useRouter()

    return (
        <Dialog open={true} onOpenChange={() => router.back()}>
            <DialogContent className="p-0 border-0 bg-transparent shadow-none max-w-md w-full sm:max-w-md">
                {/* Accessibility: Title is required by DialogContent, use VisuallyHidden if no visible title is desired in the wrapper */}
                <VisuallyHidden>
                    <DialogTitle>Login</DialogTitle>
                </VisuallyHidden>
                <LoginForm isModal className="backdrop-blur-xl bg-white/60 dark:bg-black/60 border border-white/40 dark:border-white/10 shadow-2xl ring-1 ring-white/40 dark:ring-white/5" />
            </DialogContent>
        </Dialog>
    )
}
