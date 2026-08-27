"use client"

import { Suspense } from "react"
import { LoginForm } from "@/components/auth/LoginForm"

export default function LoginPage() {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/10 blur-[120px] dark:bg-emerald-400/[0.06]" />

            <div className="relative z-10 w-full max-w-md">
                <Suspense fallback={<div className="w-full max-w-md h-96" />}>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    )
}
