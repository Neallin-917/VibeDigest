import type { UIMessageStreamWriter } from 'ai'
import type { ChatUIMessage } from '@/lib/chat-ui'
import { getResolvedTaskProgress } from '@/lib/task-progress'

type TaskStatusLike = {
  taskId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  video_title?: string
  thumbnail_url?: string
  video_url?: string
  error_message?: string
}

export function writeTaskDataParts(
  writer: UIMessageStreamWriter<ChatUIMessage>,
  task: TaskStatusLike
) {
  const progress = getResolvedTaskProgress(task.status, task.progress)

  writer.write({
    type: 'data-task-status',
    id: `task-status-${task.taskId}`,
    data: {
      taskId: task.taskId,
      status: task.status,
      progress,
      videoTitle: task.video_title,
      thumbnailUrl: task.thumbnail_url,
      videoUrl: task.video_url,
      errorMessage: task.error_message,
    },
  })

  writer.write({
    type: 'data-task-progress',
    id: `task-progress-${task.taskId}`,
    data: {
      taskId: task.taskId,
    },
  })

  writer.write({
    type: 'data-task-plan',
    id: `task-plan-${task.taskId}`,
    data: {
      taskId: task.taskId,
    },
  })
}
