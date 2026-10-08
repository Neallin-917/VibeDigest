import { beforeEach, describe, expect, it } from 'vitest'
import { matchingPendingHandoff, savePendingHandoff, PENDING_HANDOFF_KEY } from './pending-handoff'

describe('pending login handoff', () => {
  beforeEach(() => localStorage.clear())

  it('allows locale and slug changes while isolating source identity', () => {
    savePendingHandoff('Question A', { path: '/en/tasks/a/title?returnPage=1', scope: 'source', taskId: 'a' })
    const raw = localStorage.getItem(PENDING_HANDOFF_KEY)
    expect(matchingPendingHandoff(raw, { path: '/zh/tasks/a/new-slug?returnPage=2#answer', scope: 'source', taskId: 'a' })).toBe('Question A')
    expect(matchingPendingHandoff(raw, { path: '/zh/tasks/b/title', scope: 'source', taskId: 'b' })).toBeNull()
  })

  it('binds requests to the original thread and task', () => {
    savePendingHandoff('Follow-up', { path: '/en/chat?threadId=one', scope: 'workspace', taskId: 'a', threadId: 'one' })
    const raw = localStorage.getItem(PENDING_HANDOFF_KEY)
    expect(matchingPendingHandoff(raw, { path: '/zh/chat?threadId=one', scope: 'workspace', taskId: 'a', threadId: 'one' })).toBe('Follow-up')
    expect(matchingPendingHandoff(raw, { path: '/en/chat?threadId=two', scope: 'workspace', taskId: 'a', threadId: 'two' })).toBeNull()
    expect(matchingPendingHandoff(raw, { path: '/en/chat?threadId=one', scope: 'workspace', taskId: 'b', threadId: 'one' })).toBeNull()
  })

  it('keeps landing submissions out of an existing thread or task', () => {
    savePendingHandoff('https://youtu.be/fixture', { path: '/en/chat', scope: 'workspace' })
    const raw = localStorage.getItem(PENDING_HANDOFF_KEY)
    expect(matchingPendingHandoff(raw, { path: '/zh/chat', scope: 'workspace' })).toBe('https://youtu.be/fixture')
    expect(matchingPendingHandoff(raw, { path: '/en/chat', scope: 'workspace', threadId: 'existing' })).toBeNull()
    expect(matchingPendingHandoff(raw, { path: '/en/chat', scope: 'workspace', taskId: 'a' })).toBeNull()
    expect(matchingPendingHandoff(raw, { path: '/en/chat?task=a', scope: 'workspace' })).toBeNull()
  })

  it('allows legacy text only in a fresh workspace', () => {
    expect(matchingPendingHandoff('Legacy', { path: '/en/chat', scope: 'workspace' })).toBe('Legacy')
    expect(matchingPendingHandoff('Legacy', { path: '/en/chat', scope: 'workspace', taskId: 'a' })).toBeNull()
    expect(matchingPendingHandoff('Legacy', { path: '/en/chat', scope: 'workspace', threadId: 'one' })).toBeNull()
    expect(matchingPendingHandoff('Legacy', { path: '/en/tasks/a/title', scope: 'source', taskId: 'a' })).toBeNull()
  })

  it.each(['{broken', '{"version":2,"text":"hello"}', '{"version":1,"text":"hello","scope":"source","path":"//outside.example"}'])('rejects malformed structured input: %s', raw => {
    expect(matchingPendingHandoff(raw, { path: '/en/chat', scope: 'workspace' })).toBeNull()
  })

  it('matches source text without modifying the receipt', () => {
    savePendingHandoff('https://youtu.be/fixture', { path: '/en/chat', scope: 'workspace' })
    const raw = localStorage.getItem(PENDING_HANDOFF_KEY)
    expect(matchingPendingHandoff(raw, { path: '/en/chat', scope: 'workspace' })).toBe('https://youtu.be/fixture')
    expect(localStorage.getItem(PENDING_HANDOFF_KEY)).toBe(raw)
  })
})
