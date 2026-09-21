import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { env } from '@/env'
import { resolveServerBackendUrl } from '@/lib/backend-url-core'
import type { ChatUIMessage, StoredChatMessageRow } from '@/lib/chat-ui'

export type AgentRuntimeConfig = {
  runtime: 'api' | 'codex_local'
  provider: 'openai' | 'openrouter' | 'custom' | 'codex_local'
  model: string
  modelTier: 'smart'
  reasoningEffort: 'high' | 'none' | 'provider-default'
  locale: 'zh' | 'en'
  scope?: 'workspace' | 'source'
}

export type AgentTurn = {
  id: string
  thread_id: string
  user_id: string
  input_message_id: string
  task_id: string | null
  status: 'running' | 'waiting_task' | 'finalizing' | 'completed' | 'failed' | 'cancelled'
  execution_token: string
  runtime_config: AgentRuntimeConfig
  replayed?: boolean
}

export type TaskData = {
  task: {
    id: string; status: string; progress: number; video_title: string | null
    video_url: string; thumbnail_url: string | null
  }
  outputs: { id: string; kind: string; locale: string | null; status: string; content: string | null }[]
}

export class AgentServiceError extends Error {
  constructor(readonly status: number) {
    super(status === 409 ? 'Another answer is already running. Please wait or retry.'
      : status === 402 ? 'The task allowance has been reached.'
      : status === 403 ? 'This action is not available in the current conversation.'
      : 'The Agent service is temporarily unavailable.')
  }
}

export function signAgentRequest(method: string, path: string, body: string, sentAt: string) {
  if (!env.AGENT_INTERNAL_SECRET) throw new AgentServiceError(503)
  return createHmac('sha256', env.AGENT_INTERNAL_SECRET)
    .update(`${sentAt}\n${method}\n${path}\n${body}`).digest('hex')
}

export function verifyAgentRequest(request: Request, body: string): boolean {
  const sentAt = request.headers.get('x-agent-sent-at') ?? ''
  if (!/^\d+$/.test(sentAt) || Math.abs(Date.now() / 1000 - Number(sentAt)) > 60) return false
  if (!env.AGENT_INTERNAL_SECRET) return false
  const expected = Buffer.from(signAgentRequest(request.method, new URL(request.url).pathname, body, sentAt))
  const actual = Buffer.from(request.headers.get('x-agent-signature') ?? '')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function agentBackend<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  // Agent commands are server-to-server requests. Use the configured Railway
  // origin, never the public Cloudflare API domain.
  const origin = resolveServerBackendUrl({
    nodeEnv: env.NODE_ENV,
    backendApiUrl: env.BACKEND_API_URL,
    backendOriginUrl: env.BACKEND_ORIGIN_URL,
  })
  const url = new URL(`/api/internal/agent${path}`, origin)
  const body = JSON.stringify(payload)
  const sentAt = Math.floor(Date.now() / 1000).toString()
  // Correlate a rejected internal command across Vercel and Railway without
  // recording user input, identifiers, request bodies, or credentials.
  const requestId = randomUUID()
  const response = await fetch(url, {
    method: 'POST', body, cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    headers: {
      'Content-Type': 'application/json', 'x-agent-sent-at': sentAt,
      'x-agent-signature': signAgentRequest('POST', url.pathname, body, sentAt),
      'x-agent-request-id': requestId,
    },
  })
  if (!response.ok) {
    console.warn('[Task Agent] internal command rejected', {
      requestId, path, origin: url.origin, status: response.status,
    })
    throw new AgentServiceError(response.status)
  }
  return await response.json() as T
}

export function createTurnClient(turn: AgentTurn, signal?: AbortSignal) {
  const identity = { userId: turn.user_id, token: turn.execution_token }
  const call = <T>(action: string, payload: object = {}, abort = signal) => agentBackend<T>(
    `/turns/${turn.id}/${action}`, { ...identity, ...payload }, abort,
  )
  return {
    read: (taskId: string, includeSource = false) => call<TaskData>('read', {
      taskId, includeSource, locale: turn.runtime_config.locale,
    }),
    history: () => call<{ messages: StoredChatMessageRow[] }>('history'),
    submit: (videoUrl: string, locale: string) => call<Record<string, unknown>>('submit', { videoUrl, locale }),
    watch: (taskId: string) => call<Record<string, unknown>>('watch', { taskId, locale: turn.runtime_config.locale }),
    // Finish is deliberately independent of a disconnected browser signal.
    finish: (parts: ChatUIMessage['parts'], metadata: object, errorCode?: string) => agentBackend<{ saved: boolean }>(
      `/turns/${turn.id}/finish`, { ...identity, parts, metadata, errorCode },
    ),
  }
}

export type TurnClient = ReturnType<typeof createTurnClient>
