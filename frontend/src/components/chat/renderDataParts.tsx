import { isDataUIPart } from 'ai'
import { TaskDataGroup } from './TaskDataGroup'
import type { ChatUIMessagePart, ChatUIDataParts } from '@/lib/chat-ui'

type TaskDataBucket = {
  taskStatus?: ChatUIDataParts['task-status']
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
  visibleTaskIds?: Set<string>
) {
  const buckets = new Map<string, TaskDataBucket>()

  parts.forEach(part => {
    if (!isDataUIPart(part)) return
    const taskId = getTaskId(part)
    if (!taskId) return
    if (visibleTaskIds && !visibleTaskIds.has(taskId)) return

    const bucket = buckets.get(taskId) ?? {}

    switch (part.type) {
      case 'data-task-status':
        bucket.taskStatus = part.data
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
      live={liveTaskIds?.has(taskId) ?? false}
    />
  ))
}
