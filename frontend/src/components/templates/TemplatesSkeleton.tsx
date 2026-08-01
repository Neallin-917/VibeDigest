export function TemplatesSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
                <div
                    key={i}
                    className="bg-surface-raised border border-border rounded-xl overflow-hidden h-[320px] animate-pulse"
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
