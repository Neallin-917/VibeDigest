"use client"

import { Suspense } from "react"
import { LoginForm } from "@/components/auth/LoginForm"

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0A0A0A] p-4 relative overflow-hidden transition-colors duration-300">
            {/* 1. Grid Pattern Overlay */}
            <div className="absolute inset-0 z-0 opacity-[0.4] dark:opacity-[0.2]"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, rgb(203 213 225) 1px, transparent 0)`, // slate-300 for light
                    backgroundSize: '40px 40px'
                }}
            >
                <div className="absolute inset-0 dark:hidden" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, rgb(203 213 225) 1px, transparent 0)`, backgroundSize: '40px 40px' }}></div>
                <div className="absolute inset-0 hidden dark:block" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, rgb(255 255 255) 1px, transparent 0)`, backgroundSize: '40px 40px' }}></div>
            </div>

            {/* 2. Brand Ambient Glow (Adaptive) */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
                {/* Top Left - Primary Emerald Glow */}
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-400/20 dark:bg-emerald-500/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-normal animate-blob" />

                {/* Top Right - Cyan/Teal Glow */}
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-400/20 dark:bg-cyan-500/10 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-normal animate-blob animation-delay-2000" />

                {/* Bottom Center - Subtle Blue Accent */}
                <div className="absolute bottom-[-20%] left-[30%] w-[40%] h-[40%] bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-normal animate-blob animation-delay-4000" />
            </div>

            {/* 3. Content */}
            <div className="relative z-10 w-full max-w-md">
                <Suspense fallback={<div className="w-full max-w-md h-96" />}>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    )
}
