"use client"

import { Plus, Library } from "lucide-react"
import { cn } from "@/lib/utils"
// Radix tooltip currently triggers update-depth errors in this view; use lightweight hover hints.

interface CollapsedViewProps {
    onNewChat: () => void
    onCommunityClick: () => void
    t: (key: string) => string
}

export function CollapsedView({ onNewChat, onCommunityClick, t }: CollapsedViewProps) {
    return (
        <nav className="flex-1 flex flex-col gap-1.5 pt-2">
            {/* New Task */}
            <div className="group relative flex items-center justify-center">
                <button
                    onClick={onNewChat}
                    className={cn(
                        "p-3 rounded-xl flex items-center justify-center transition-all",
                        "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
                        "dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
                    )}
                    aria-label={t("chat.newChat") || "New chat"}
                >
                    <Plus className="w-5 h-5" />
                </button>
                <span
                    className={cn(
                        "pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md px-3 py-1.5 text-xs z-50",
                        "bg-foreground text-background opacity-0 translate-x-1 transition-all",
                        "group-hover:opacity-100 group-hover:translate-x-0"
                    )}
                >
                    {t("chat.newChat") || "New chat"}
                </span>
            </div>

            {/* Community */}
            <div className="group relative flex items-center justify-center">
                <button
                    onClick={onCommunityClick}
                    className={cn(
                        "p-3 rounded-xl flex items-center justify-center transition-all",
                        "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
                        "dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10"
                    )}
                    aria-label={t("chat.community") || "Community"}
                >
                    <Library className="w-5 h-5" />
                </button>
                <span
                    className={cn(
                        "pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md px-3 py-1.5 text-xs z-50",
                        "bg-foreground text-background opacity-0 translate-x-1 transition-all",
                        "group-hover:opacity-100 group-hover:translate-x-0"
                    )}
                >
                    {t("chat.community") || "Community"}
                </span>
            </div>
        </nav>
    )
}
