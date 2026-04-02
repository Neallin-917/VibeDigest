import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const textVariants = cva("", {
  variants: {
    variant: {
      body: "text-sm leading-relaxed", /* Was text-base */
      bodySm: "text-xs leading-5",
      caption: "text-[10px] leading-4", /* Was text-xs */
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
    },
  },
  defaultVariants: {
    variant: "body",
    tone: "default",
    weight: "normal",
  },
})

export interface TextProps
  extends VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div" | "label"
}

type TextAs = NonNullable<TextProps["as"]>

type AsProp<T extends React.ElementType> = {
  as?: T
}

type PropsToOmit<T extends React.ElementType, P> = keyof (AsProp<T> & P)

type PolymorphicComponentProps<T extends React.ElementType, Props = object> =
  React.PropsWithChildren<Props & AsProp<T>> &
  Omit<React.ComponentPropsWithoutRef<T>, PropsToOmit<T, Props>>

type PolymorphicRef<T extends React.ElementType> = React.ComponentPropsWithRef<T>["ref"]

type TextOwnProps = VariantProps<typeof textVariants>

export type PolymorphicTextProps<T extends React.ElementType = TextAs> = PolymorphicComponentProps<T, TextOwnProps>

type TextComponent = <T extends React.ElementType = "p">(
  props: PolymorphicTextProps<T> & { ref?: PolymorphicRef<T> }
) => React.ReactElement | null

// NOTE: React.forwardRef cannot express generics directly. We implement with `any` and cast to a generic component type.
const TextBase = React.forwardRef(
  (
    { as, className, variant, tone, weight, ...props }: PolymorphicTextProps<React.ElementType>,
    ref: React.ForwardedRef<unknown>
  ) => {
    const Comp = (as ?? "p") as React.ElementType
    return (
      <Comp
        ref={ref}
        className={cn(textVariants({ variant, tone, weight }), className)}
        {...props}
      />
    )
  }
)
TextBase.displayName = "Text"
export const Text = TextBase as unknown as TextComponent

const headingVariants = cva("tracking-tight", {
  variants: {
    variant: {
      display:
        "text-4xl leading-tight md:text-6xl font-bold tracking-tighter", /* Reduced from 5xl/7xl */
      h1: "text-2xl leading-8 font-bold", /* Reduced from 26px */
      h2: "text-lg leading-6 font-bold",  /* Reduced from 20px, leading-7 -> 6 */
      h3: "text-sm leading-5 font-semibold", /* Reduced from base, leading-6 -> 5 */
      pageTitle:
        "text-lg leading-6 font-bold md:text-xl break-words",
      mediaTitle:
        "text-base leading-6 font-bold md:text-lg text-white line-clamp-2",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "h2",
    tone: "default",
  },
})

export interface HeadingProps
  extends VariantProps<typeof headingVariants> {
  as?: "h1" | "h2" | "h3"
}

type HeadingAs = NonNullable<HeadingProps["as"]>

type HeadingOwnProps = VariantProps<typeof headingVariants>
export type PolymorphicHeadingProps<T extends React.ElementType = HeadingAs> = PolymorphicComponentProps<T, HeadingOwnProps>

type HeadingComponent = <T extends React.ElementType = "h2">(
  props: PolymorphicHeadingProps<T> & { ref?: PolymorphicRef<T> }
) => React.ReactElement | null

const HeadingBase = React.forwardRef(
  (
    { as, className, variant, tone, ...props }: PolymorphicHeadingProps<React.ElementType>,
    ref: React.ForwardedRef<unknown>
  ) => {
    const Comp = (as ?? "h2") as React.ElementType
    return (
      <Comp
        ref={ref}
        className={cn(headingVariants({ variant, tone }), className)}
        {...props}
      />
    )
  }
)
HeadingBase.displayName = "Heading"
export const Heading = HeadingBase as unknown as HeadingComponent

export { textVariants, headingVariants }
