export default function Loading() {
    return (
        <div className="container mx-auto py-6 space-y-8 p-6">
            <div className="animate-pulse space-y-8">
                {/* Header Section */}
                <div className="space-y-4">
                    {/* Breadcrumb approximation */}
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />

                    {/* Title */}
                    <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />

                    {/* Badges/Meta */}
                    <div className="flex gap-2">
                        <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-full" />
                        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded-full" />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Video Player Area */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Video Player */}
                        <div className="w-full aspect-video bg-gray-200 dark:bg-gray-800 rounded-xl" />

                        {/* Action Bar */}
                        <div className="flex justify-between items-center">
                            <div className="flex gap-3">
                                <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
                                <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
                            </div>
                            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-full" />
                        </div>

                        {/* Mindmap/Content Placeholder */}
                        <div className="space-y-4">
                            <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
                            <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
                            <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
                        </div>
                    </div>

                    {/* Right Column - Tabs/Summary Area */}
                    <div className="lg:col-span-1">
                        <div className="h-[600px] w-full bg-gray-200 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800" />
                    </div>
                </div>
            </div>
        </div>
    )
}
