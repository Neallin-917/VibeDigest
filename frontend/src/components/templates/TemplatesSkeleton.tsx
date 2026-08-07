import { cva } from "class-variance-authority"

const skeletonGrid = cva("grid grid-cols-1 gap-6 sm:grid-cols-2", {
    variants: {
        layout: {
            gallery: "lg:grid-cols-3 xl:grid-cols-4",
            landingPreview: "lg:grid-cols-3 xl:grid-cols-4",
        },
    },
    defaultVariants: {
        layout: "gallery",
    },
})

export function TemplatesSkeleton({
    count = 8,
    layout = "gallery",
}: {
    count?: number
    layout?: "gallery" | "landingPreview"
}) {
    return (
        <div className={skeletonGrid({ layout })}>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className={`h-[320px] overflow-hidden rounded-xl border border-border bg-surface-raised animate-pulse ${layout === "landingPreview" && i >= 3 ? "hidden xl:block" : ""}`}
                >
                    {/* Cover Image Skeleton */}
                    <div className="h-40 bg-muted w-full" />

                    {/* Content Skeleton */}
                    <div className="p-4 space-y-3">
                        {/* Title */}
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-4 bg-muted rounded w-1/2" />

                        {/* Footer (Author & Date) */}
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                            <div className="w-6 h-6 rounded-full bg-muted" />
                            <div className="h-3 bg-muted rounded w-20" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
