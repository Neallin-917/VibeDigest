import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface BrandLogoProps {
    className?: string
    showText?: boolean
    textClassName?: string
}

export function BrandLogo({ className, showText = true, textClassName }: BrandLogoProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#009873] to-[#10b981] dark:from-[#009873] dark:to-[#34d399] flex items-center justify-center shadow-lg shadow-emerald-900/10 transition-shadow">
                <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            {showText && (
                <span className={cn(
                    "font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-600 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-300",
                    textClassName
                )}>
                    VibeDigest
                </span>
            )}
        </div>
    )
}
