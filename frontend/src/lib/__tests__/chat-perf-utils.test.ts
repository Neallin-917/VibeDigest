import { describe, it, expect } from 'vitest'
import {
  checkHasRenderableAssistant,
  partsAreEqual,
} from '../chat-perf-utils'
import type { ChatUIMessage } from '@/lib/chat-ui'

// Helper to build a ChatUIMessage quickly
function msg(
  role: ChatUIMessage['role'],
  parts: ChatUIMessage['parts'],
  id = 'msg-1'
): ChatUIMessage {
  return { id, role, parts }
}

// ---------------------------------------------------------------------------
// checkHasRenderableAssistant
// ---------------------------------------------------------------------------
describe('checkHasRenderableAssistant', () => {
  it('returns true when assistant message has text content', () => {
    const messages: ChatUIMessage[] = [
      msg('assistant', [{ type: 'text', text: 'Hello world' }]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(true)
  })

  it('returns false when messages is empty', () => {
    expect(checkHasRenderableAssistant([])).toBe(false)
  })

  it('returns false when only user messages exist', () => {
    const messages: ChatUIMessage[] = [
      msg('user', [{ type: 'text', text: 'Hi' }]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(false)
  })

  it('returns false for hidden get_task_status success tool', () => {
    const messages: ChatUIMessage[] = [
      msg('assistant', [
        {
          type: 'tool-get_task_status',
          toolCallId: 'tc1',
          state: 'result',
          args: {},
          output: { taskId: 't1' },
        } as any,
      ]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(false)
  })

  it('returns false when assistant text is only whitespace', () => {
    const messages: ChatUIMessage[] = [
      msg('assistant', [{ type: 'text', text: '   ' }]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(false)
  })

  it('returns true for dynamic-tool type with non-hidden toolName', () => {
    const messages: ChatUIMessage[] = [
      msg('assistant', [
        { type: 'dynamic-tool', toolName: 'custom_tool', toolCallId: 'tc1', state: 'result', args: {}, output: {} } as any,
      ]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(true)
  })

  it('returns true for persistent task data parts', () => {
    const messages: ChatUIMessage[] = [
      msg('assistant', [
        {
          type: 'data-task-status',
          id: 'task-status-task-1',
          data: { taskId: 'task-1', status: 'processing', progress: 20 },
        } as any,
      ]),
    ]
    expect(checkHasRenderableAssistant(messages)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// partsAreEqual  (Cycle 2: shallow parts comparison)
// ---------------------------------------------------------------------------
describe('partsAreEqual', () => {
  it('returns true for identical parts arrays (same reference)', () => {
    const parts: ChatUIMessage['parts'] = [{ type: 'text', text: 'hello' }]
    expect(partsAreEqual(parts, parts)).toBe(true)
  })

  it('returns false when parts count differs', () => {
    const prev: ChatUIMessage['parts'] = [{ type: 'text', text: 'a' }]
    const next: ChatUIMessage['parts'] = [
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]
    expect(partsAreEqual(prev, next)).toBe(false)
  })

  it('returns false when text content changes', () => {
    const prev: ChatUIMessage['parts'] = [{ type: 'text', text: 'hello' }]
    const next: ChatUIMessage['parts'] = [{ type: 'text', text: 'world' }]
    expect(partsAreEqual(prev, next)).toBe(false)
  })

  it('returns true when text content is identical (different refs)', () => {
    const prev: ChatUIMessage['parts'] = [{ type: 'text', text: 'hello' }]
    const next: ChatUIMessage['parts'] = [{ type: 'text', text: 'hello' }]
    expect(partsAreEqual(prev, next)).toBe(true)
  })

  it('returns false when part type changes', () => {
    const prev: ChatUIMessage['parts'] = [{ type: 'text', text: 'x' }]
    const next: ChatUIMessage['parts'] = [
      { type: 'tool-get_task_status', toolCallId: 'tc1', state: 'result', args: {}, output: {} } as any,
    ]
    expect(partsAreEqual(prev, next)).toBe(false)
  })

  it('returns true when tool part is same reference', () => {
    const toolPart = {
      type: 'tool-get_task_status',
      toolCallId: 'tc1',
      state: 'result',
      args: {},
      output: { taskId: 't1' },
    } as any
    const prev: ChatUIMessage['parts'] = [toolPart]
    const next: ChatUIMessage['parts'] = [toolPart]
    expect(partsAreEqual(prev, next)).toBe(true)
  })

  it('returns false when tool parts differ by reference', () => {
    const prev: ChatUIMessage['parts'] = [
      { type: 'tool-get_task_status', toolCallId: 'tc1', state: 'result', args: {}, output: { taskId: 't1' } } as any,
    ]
    const next: ChatUIMessage['parts'] = [
      { type: 'tool-get_task_status', toolCallId: 'tc1', state: 'result', args: {}, output: { taskId: 't1' } } as any,
    ]
    // Different object references => false (by design for O(1) comparison)
    expect(partsAreEqual(prev, next)).toBe(false)
  })

  it('handles empty parts arrays', () => {
    expect(partsAreEqual([], [])).toBe(true)
  })
})
