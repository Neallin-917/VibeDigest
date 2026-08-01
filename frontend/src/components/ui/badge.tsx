import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 shadow-[0_0_10px_rgba(62,207,142,0.2)]",
                secondary:
                    "border-border bg-surface-subtle text-muted-foreground hover:bg-accent",
                destructive:
                    "border-transparent bg-red-500/15 text-red-400 hover:bg-red-500/25",
                outline: "text-foreground border-border hover:bg-accent",
                success: "border-transparent bg-success/10 text-success hover:bg-success/15",
                processing: "border-transparent bg-primary/15 text-primary hover:bg-primary/25 shadow-[0_0_10px_rgba(62,207,142,0.15)]",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
