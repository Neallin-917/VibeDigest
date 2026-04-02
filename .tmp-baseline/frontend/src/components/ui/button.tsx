import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-[color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter] duration-300 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.96]",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 hover:scale-105",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:scale-105",
                outline:
                    "border border-black/5 bg-white/50 backdrop-blur-md hover:bg-white/80 hover:border-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:border-white/20",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-black/5 dark:hover:bg-white/10",
                link: "text-primary underline-offset-4 hover:underline",
                // Retaining legacy variants just in case, but remapping them
                supa: "bg-primary text-primary-foreground hover:opacity-90",
                pill: "rounded-full bg-primary text-primary-foreground",
                "pill-primary": "rounded-full bg-primary text-primary-foreground",
            },
            size: {
                default: "h-11 px-6",
                sm: "h-9 px-4 text-xs",
                lg: "h-12 px-8 text-base",
                xl: "h-14 px-10 text-lg",
                icon: "h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
    isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={isLoading || disabled}
                {...props}
            >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </Comp>
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }

