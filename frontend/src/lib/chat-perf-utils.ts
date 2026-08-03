import type { ChatUIMessage } from '@/lib/chat-ui'

/**
 * Part shape used for type-safe checks without importing internal AI SDK types.
 */
interface ToolPart {
  type: string
  text?: string
  toolName?: string
  errorText?: string
  output?: unknown
}

function shouldCountToolPart(part: ToolPart) {
  const toolName =
    part.type === 'dynamic-tool'
      ? part.toolName ?? ''
      : part.type.startsWith('tool-')
        ? part.type.replace('tool-', '')
        : ''

  const output = part.output
  const hasError =
    Boolean(part.errorText) ||
    (typeof output === 'object' &&
      output !== null &&
      'error' in output &&
      typeof (output as { error?: unknown }).error === 'string')

  switch (toolName) {
    case 'get_task_status':
      return hasError
    default:
      return true
  }
}

/**
 * Returns `true` when at least one assistant message contains a part that
 * should be rendered in the chat (non-empty text, tool parts, or data parts).
 *
 * Extracted from ChatContainer `useMemo` for testability and reuse.
 */
export function checkHasRenderableAssistant(messages: ChatUIMessage[]): boolean {
  return messages.some((m) => {
    if (m.role !== 'assistant') return false
    return (m.parts || []).some((part: unknown) => {
      const p = part as ToolPart
      if (p.type === 'text') return Boolean(p.text?.trim())
      if (p.type?.startsWith('tool-') || p.type === 'dynamic-tool') return shouldCountToolPart(p)
      if (p.type?.startsWith('data-')) return true
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
 * - Tool / data / other parts: compare by reference (parts don't mutate in place)
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
      // Non-text parts: compare by reference (tool/data output won't mutate in place)
      if (prev !== next) return false
    }
  }
  return true
}
