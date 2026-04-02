"use client"

import { Loader2, Trash2, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Task } from "@/types"

interface TaskItemProps {
    task: Task
    onSelect: () => void
    onDelete: (e: React.MouseEvent) => void
    isDeleting: boolean
}

export function TaskItem({ task, onSelect, onDelete, isDeleting }: TaskItemProps) {
    return (
        <div
            onClick={onSelect}
            className={cn(
                "group w-full text-left px-3 py-2 rounded-xl transition-all flex items-center gap-3 cursor-pointer relative",
                "hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
            )}
        >
            {/* Status Icon */}
            <StatusIcon status={task.status} />

            {/* Title */}
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 truncate">
                {task.video_title || 'Untitled'}
            </span>

            {/* Delete Button */}
            <button
                onClick={onDelete}
                className={cn(
                    "p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0",
                    "hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-500",
                    isDeleting && "opacity-100"
                )}
                aria-label="Delete"
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
            return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
        case 'processing':
            return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
        case 'failed':
            return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        default:
            return <Clock className="w-4 h-4 text-slate-400 shrink-0" />
    }
}
