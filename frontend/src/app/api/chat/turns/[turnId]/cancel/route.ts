import { z } from 'zod'
import { verifyAuth, isAuthError } from '../../../auth'
import { agentBackend, AgentServiceError } from '@/lib/agent/backend'

export async function POST(_request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const auth = await verifyAuth()
  if (isAuthError(auth)) return auth.response
  const parsed = z.uuid().safeParse((await params).turnId)
  if (!parsed.success) return Response.json({ error: 'Invalid turn' }, { status: 400 })
  try {
    const result = await agentBackend<{ cancelled: boolean }>(`/turns/${parsed.data}/cancel`, { userId: auth.user.id })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: 'Unable to cancel this answer.' }, { status: error instanceof AgentServiceError ? error.status : 503 })
  }
}
