import type { ChatUIMessage } from '@/lib/chat-ui'

/**
 * Part shape used for type-safe checks without importing internal AI SDK types.
 */
interface ToolPart {
  type: string
  text?: string
  toolName?: string
  output?: { taskId?: string }
  input?: { taskId?: string }
}

/**
 * Resolves the canonical tool name from a message part's `type` field.
 * Handles both `tool-<name>` and `dynamic-tool` conventions.
 */
function resolveToolName(part: ToolPart): string {
  if (part.type === 'dynamic-tool') return part.toolName ?? ''
  if (part.type.startsWith('tool-')) return part.type.replace('tool-', '')
  return ''
}

/**
 * Returns `true` when at least one assistant message contains a part that
 * should be rendered in the chat (non-empty text, or a tool other than
 * preview_video / incomplete create_task).
 *
 * Extracted from ChatContainer `useMemo` for testability and reuse.
 */
export function checkHasRenderableAssistant(messages: ChatUIMessage[]): boolean {
  return messages.some((m) => {
    if (m.role !== 'assistant') return false
    return (m.parts || []).some((part: unknown) => {
      const p = part as ToolPart
      if (p.type === 'text') return Boolean(p.text?.trim())
      if (p.type?.startsWith('tool-') || p.type === 'dynamic-tool') {
        const toolName = resolveToolName(p)
        if (toolName === 'preview_video') return false
        if (toolName === 'create_task' && !p.output?.taskId) return false
        return true
      }
      return false
    })
  })
}

/**
 * Efficient shallow comparison of two `ChatUIMessage['parts']` arrays.
 *
 * - Same reference → true (fast path)
 * - Different length → false
 * - Text parts: compare `.text` by value (string identity)
 * - Tool / other parts: compare by reference (tools don't mutate in place)
 *
 * This replaces `JSON.stringify` deep-equal which is O(n*size) with
 * an O(n) loop that avoids serialization entirely.
 */
export function partsAreEqual(
  prevParts: ChatUIMessage['parts'],
  nextParts: ChatUIMessage['parts']
): boolean {
  if (prevParts === nextParts) return true
  if (prevParts.length !== nextParts.length) return false
  for (let i = 0; i < prevParts.length; i++) {
    const prev = prevParts[i]
    const next = nextParts[i]
    if (prev.type !== next.type) return false
    if (prev.type === 'text' && next.type === 'text') {
      if (prev.text !== next.text) return false
    } else {
      // Tool parts: compare by reference (tool output won't mutate in place)
      if (prev !== next) return false
    }
  }
  return true
}

/**
 * Returns `true` when any message contains a `get_task_status` or
 * `create_task` tool part whose taskId matches the given activeTaskId.
 *
 * Extracted from ChatContainer `useMemo` for testability and reuse.
 */
export function checkHasTaskStatusForActiveTask(
  messages: ChatUIMessage[],
  activeTaskId: string | null
): boolean {
  if (!activeTaskId) return false
  return messages.some((message) => {
    return (message.parts || []).some((part: unknown) => {
      const p = part as ToolPart
      const toolName = resolveToolName(p)
      const taskId = p.output?.taskId || p.input?.taskId
      if (!taskId) return false
      return (
        (toolName === 'get_task_status' || toolName === 'create_task') &&
        taskId === activeTaskId
      )
    })
  })
}
