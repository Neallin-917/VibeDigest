// Browser-only login handoff. This is input continuity, never task state.
export const PENDING_HANDOFF_KEY = 'vibedigest_pending_message'

export type HandoffTarget = {
  path: string
  scope: 'workspace' | 'source'
  taskId?: string | null
  threadId?: string | null
}

type PendingHandoff = HandoffTarget & { version: 1; text: string }

function destination(path: string) {
  const url = new URL(path, 'https://vibedigest.invalid')
  const pathname = url.pathname.replace(/^\/(en|zh)(?=\/|$)/, '') || '/'
  // Slugs and library return parameters do not change the source identity.
  const sourcePath = pathname.match(/^\/tasks\/([^/]+)/)?.[0]
  return JSON.stringify([
    sourcePath ?? pathname,
    url.searchParams.get('task'),
    url.searchParams.get('threadId'),
  ])
}

export function savePendingHandoff(text: string, target: HandoffTarget) {
  localStorage.setItem(PENDING_HANDOFF_KEY, JSON.stringify({ ...target, version: 1, text } satisfies PendingHandoff))
}

function decode(raw: string): PendingHandoff | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const item = value as Partial<PendingHandoff>
    if (item.version !== 1 || typeof item.text !== 'string' || !item.text.trim()
      || typeof item.path !== 'string' || !item.path.startsWith('/') || item.path.startsWith('//')
      || !['workspace', 'source'].includes(item.scope ?? '')
      || (item.taskId != null && typeof item.taskId !== 'string')
      || (item.threadId != null && typeof item.threadId !== 'string')) return null
    return item as PendingHandoff
  } catch {
    return null
  }
}

export function matchingPendingHandoff(raw: string | null, target: HandoffTarget): string | null {
  if (!raw) return null
  const handoff = decode(raw)
  if (!handoff) {
    // Legacy text has no source identity: only a fresh workspace may consume it.
    return !raw.trimStart().startsWith('{') && target.scope === 'workspace'
      && !target.taskId && !target.threadId && destination(target.path) === destination('/chat')
      ? raw : null
  }
  if (handoff.scope !== target.scope || destination(handoff.path) !== destination(target.path)
    || (handoff.taskId ?? null) !== (target.taskId ?? null)
    || (handoff.threadId && handoff.threadId !== target.threadId)) return null
  // A landing submission belongs to a new conversation, never an existing one.
  if (target.scope === 'workspace' && !handoff.threadId && target.threadId) return null
  return handoff.text
}
