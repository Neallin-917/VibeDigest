"use client"

import { Loader2, Trash2, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Task } from "@/types"
import { useI18n } from "@/components/i18n/I18nProvider"

interface TaskItemProps {
    task: Task
    onSelect: () => void
    onDelete: (e: React.MouseEvent) => void
    isDeleting: boolean
}

export function TaskItem({ task, onSelect, onDelete, isDeleting }: TaskItemProps) {
    const { t } = useI18n()

    return (
        <div
            onClick={onSelect}
            className={cn(
                "group w-full text-left px-3 py-2 rounded-xl transition-all flex items-center gap-3 cursor-pointer relative",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
        >
            {/* Status Icon */}
            <StatusIcon status={task.status} />

            {/* Title */}
            <span className="flex-1 truncate text-sm text-foreground-soft group-hover:text-sidebar-accent-foreground">
                {task.video_title || t("common.untitled")}
            </span>

            {/* Delete Button */}
            <button
                onClick={onDelete}
                className={cn(
                    "p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0",
                    "text-foreground-subtle hover:bg-destructive/10 hover:text-destructive",
                    isDeleting && "opacity-100"
                )}
                aria-label={t("common.delete")}
            >
                {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                )}
            </button>
        </div>
    )
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return <CheckCircle className="h-4 w-4 shrink-0 text-success" />
        case 'processing':
            return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-processing" />
        case 'failed':
            return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        default:
            return <Clock className="h-4 w-4 shrink-0 text-foreground-subtle" />
    }
}
