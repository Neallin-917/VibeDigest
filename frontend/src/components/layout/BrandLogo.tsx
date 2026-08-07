import Image from "next/image"
import { cn } from "@/lib/utils"

interface BrandLogoProps {
    className?: string
    showText?: boolean
    textClassName?: string
}

export function BrandLogo({ className, showText = true, textClassName }: BrandLogoProps) {
    return (
        <div
            className={cn("flex items-center gap-2", className)}
            role={showText ? undefined : "img"}
            aria-label={showText ? undefined : "VibeDigest"}
        >
            <Image
                src="/brand/vibedigest-mark.svg"
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-[0.35rem]"
                unoptimized
            />
            {showText && (
                <span className={cn(
                    "font-semibold tracking-[-0.025em] text-foreground",
                    textClassName
                )}>
                    VibeDigest
                </span>
            )}
        </div>
    )
}
