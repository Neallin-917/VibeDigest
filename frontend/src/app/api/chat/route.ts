import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'
import { verifyAuth, isAuthError } from './auth'
import { deriveThreadTitle } from '@/lib/agent/thread-title'
import { sanitizeStoredMessages } from '@/lib/chat-message-boundary'
import type { ChatUIMessage } from '@/lib/chat-ui'
import { agentBackend, AgentServiceError, createTurnClient, type AgentTurn } from '@/lib/agent/backend'
import {
  AGENT_QUOTA_EXCEEDED_CODE,
  AGENT_QUOTA_EXCEEDED_SIGNAL,
  isAgentQuotaExceededError,
} from '@/lib/agent/error-codes'
import { resolveAgentRuntime, runTaskAgent } from '@/lib/agent/task-agent'

export const runtime = 'nodejs'
export const maxDuration = 180

const requestSchema = z.object({
  threadId: z.uuid(),
  taskId: z.uuid().nullable().optional(),
  locale: z.enum(['zh', 'en', 'ja']).default('zh'),
  scope: z.enum(['workspace', 'source']).default('workspace'),
  message: z.object({
    id: z.string().min(1).max(200),
    role: z.literal('user'),
    parts: z.array(z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(30_000) }))
      .min(1).max(1),
  }),
})

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json())
    if (!body.success) return Response.json({ error: 'Invalid chat request' }, { status: 400 })
    const auth = await verifyAuth()
    if (isAuthError(auth)) return auth.response
    const payload = body.data
    const config = { ...resolveAgentRuntime(payload.locale), scope: payload.scope }
    const text = payload.message.parts.map(part => part.text).join('\n')
    // The accepted input precedes inference and all tool side effects.
    const turn = await agentBackend<AgentTurn>('/turns', {
      userId: auth.user.id, threadId: payload.threadId, messageId: payload.message.id,
      parts: payload.message.parts, taskId: payload.taskId ?? null,
      title: deriveThreadTitle(text), runtimeConfig: config,
    }, request.signal)
    const client = createTurnClient(turn, request.signal)

    const stream = createUIMessageStream<ChatUIMessage>({
      onError: error => isAgentQuotaExceededError(error)
        ? AGENT_QUOTA_EXCEEDED_SIGNAL
        : 'The Agent service is temporarily unavailable. Retry this message; an accepted video task will continue.',
      execute: async ({ writer }) => {
        if (turn.replayed) {
          const { messages } = await client.history()
          const stored = messages.find(message => message.id === 'agent:' + turn.id + ':completion')
            ?? messages.find(message => message.id === 'agent:' + turn.id + ':reply')
          if (!stored) throw new AgentServiceError(409)
          const replay = sanitizeStoredMessages([stored]).validMessages[0]
          if (!replay) throw new AgentServiceError(503)
          writer.write({ type: 'start', messageId: replay.id, messageMetadata: replay.metadata })
          for (const part of replay.parts) {
            if (part.type === 'text') {
              writer.write({ type: 'text-start', id: 'answer' })
              writer.write({ type: 'text-delta', id: 'answer', delta: part.text })
              writer.write({ type: 'text-end', id: 'answer' })
            } else if (part.type === 'source-url' || part.type === 'data-task-status') writer.write(part)
          }
          writer.write({ type: 'finish' })
          return
        }
        writer.write({
          type: 'start', messageId: 'agent:' + turn.id + ':reply',
          messageMetadata: { ...config, agentTurnId: turn.id, agentState: 'running' },
        })
        let textStarted = false
        try {
          const result = await runTaskAgent(turn, client, {
            signal: request.signal,
            onText: delta => {
              if (!textStarted) {
                writer.write({ type: 'text-start', id: 'answer' })
                textStarted = true
              }
              writer.write({ type: 'text-delta', id: 'answer', delta })
            },
            onPart: part => {
              if (part.type === 'source-url' || part.type === 'data-task-status') writer.write(part)
            },
          })
          if (textStarted) writer.write({ type: 'text-end', id: 'answer' })
          writer.write({
            type: 'finish',
            messageMetadata: { ...result.metadata, agentTurnId: turn.id, agentState: result.waiting ? 'waiting_task' : 'completed' },
          })
        } catch (error) {
          if (textStarted) writer.write({ type: 'text-end', id: 'answer' })
          throw error
        }
      },
    })
    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    const status = error instanceof AgentServiceError ? error.status : error instanceof SyntaxError ? 400 : 503
    const message = error instanceof AgentServiceError ? error.message : 'The Agent service is temporarily unavailable.'
    return Response.json(
      status === 402 ? { error: message, code: AGENT_QUOTA_EXCEEDED_CODE } : { error: message },
      { status },
    )
  }
}
