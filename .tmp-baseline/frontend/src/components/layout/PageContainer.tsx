import React from "react"
import { cn } from "@/lib/utils"

interface PageContainerProps {
    children: React.ReactNode
    className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
    return (
        <main className={cn("flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8", className)}>
            {children}
        </main>
    )
}
