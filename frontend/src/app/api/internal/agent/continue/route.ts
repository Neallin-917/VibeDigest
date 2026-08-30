import { z } from 'zod'
import { agentBackend, createTurnClient, verifyAgentRequest, type AgentTurn } from '@/lib/agent/backend'
import { runTaskAgent } from '@/lib/agent/task-agent'

export const runtime = 'nodejs'
export const maxDuration = 180

const deliverySchema = z.object({
  turnId: z.uuid(), jobId: z.uuid(), queueName: z.string().regex(/^agent_answers(_[a-z0-9_]+)?$/),
  messageId: z.number().int().positive(), readCount: z.number().int().positive(),
}).strict()

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 4000 || !verifyAgentRequest(request, raw)) return new Response(null, { status: 401 })
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return new Response(null, { status: 400 }) }
  const body = deliverySchema.safeParse(parsed)
  if (!body.success) return new Response(null, { status: 400 })
  const { turnId, ...delivery } = body.data
  try {
    const claimed = await agentBackend<AgentTurn | { skip: true } | { deferSeconds: number }>(
      '/turns/' + turnId + '/claim', delivery, request.signal,
    )
    if ('skip' in claimed) return Response.json({ completed: true })
    if ('deferSeconds' in claimed) return Response.json(claimed, { status: 202 })
    const result = await runTaskAgent(claimed, createTurnClient(claimed, request.signal), { signal: request.signal })
    if (!result.saved) return Response.json({ completed: false }, { status: 409 })
    return Response.json({ completed: true })
  } catch {
    // No private context, tokens or upstream error details cross this endpoint.
    return Response.json({ completed: false }, { status: 503 })
  }
}
