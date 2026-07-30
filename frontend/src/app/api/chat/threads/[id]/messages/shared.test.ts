import { describe, expect, it, vi } from 'vitest'
import { getThreadMessagesResponse } from './shared'

describe('getThreadMessagesResponse', () => {
  it('reads the RLS-protected message table without a redundant thread query', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'message-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          created_at: '2026-07-31T00:00:00Z',
          metadata: {},
        },
      ],
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    const response = await getThreadMessagesResponse({
      supabase: { from } as never,
      threadId: 'thread-1',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { createdAt: '2026-07-31T00:00:00Z' },
      },
    ])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('chat_messages')
    expect(select).toHaveBeenCalledWith('id, role, content, created_at, metadata')
    expect(eq).toHaveBeenCalledWith('thread_id', 'thread-1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})
