import { isDataUIPart } from 'ai'
import { TaskDataGroup } from './TaskDataGroup'
import type { ChatUIMessagePart, ChatUIDataParts } from '@/lib/chat-ui'

type TaskDataBucket = {
  taskStatus?: ChatUIDataParts['task-status']
  showProgress: boolean
  showPlan: boolean
}

function getTaskId(part: ChatUIMessagePart) {
  if (!isDataUIPart(part)) return null
  if (!('data' in part) || typeof part.data !== 'object' || part.data === null) return null
  const data = part.data as { taskId?: unknown }
  return typeof data.taskId === 'string' ? data.taskId : null
}

export function renderDataParts(
  parts: ChatUIMessagePart[],
  liveTaskIds?: Set<string>,
  onOpenPanel?: (taskId: string) => void
) {
  const buckets = new Map<string, TaskDataBucket>()

  parts.forEach(part => {
    if (!isDataUIPart(part)) return
    const taskId = getTaskId(part)
    if (!taskId) return

    const bucket = buckets.get(taskId) ?? {
      showPlan: false,
      showProgress: false,
    }

    switch (part.type) {
      case 'data-task-status':
        bucket.taskStatus = part.data
        break
      case 'data-task-progress':
        bucket.showProgress = true
        break
      case 'data-task-plan':
        bucket.showPlan = true
        break
      default:
        break
    }

    buckets.set(taskId, bucket)
  })

  return Array.from(buckets.entries()).map(([taskId, bucket]) => (
    <TaskDataGroup
      key={taskId}
      taskStatus={bucket.taskStatus}
      showProgress={bucket.showProgress}
      showPlan={bucket.showPlan}
      live={liveTaskIds?.has(taskId) ?? false}
      onOpenPanel={onOpenPanel}
    />
  ))
}
