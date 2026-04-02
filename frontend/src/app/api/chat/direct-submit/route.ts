import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { BACKEND_API_URL } from '@/lib/backend-url'
import { createClient } from '@/lib/supabase/server'
import {
  createTaskDataParts,
  createUserTextMessage,
  type ChatUIMessage,
} from '@/lib/chat-ui'
import { upsertChatState } from '../persistence'

type DirectSubmitPayload = {
  threadId?: string
  videoUrl?: string
  originalText?: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Session invalid' }, { status: 401 })
  }

    try {
        const body = (await req.json()) as DirectSubmitPayload
        if (!body.videoUrl || !body.originalText || !body.threadId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

    const formData = new FormData()
    formData.append('video_url', body.videoUrl)

    const res = await fetch(`${BACKEND_API_URL}/api/process-video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        {
          error: 'Task creation failed',
          code: 'TASK_CREATION_FAILED',
          details: errorText || `Backend returned status ${res.status}`,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    const taskId = typeof data.task_id === 'string' ? data.task_id : null

    if (!taskId) {
      return NextResponse.json({ error: 'Task creation failed' }, { status: 502 })
    }

    const userMessage = createUserTextMessage(`direct-user-${uuidv4()}`, body.originalText)
    const assistantMessage = createTaskDataParts({
      messageId: `direct-assistant-${uuidv4()}`,
      taskId,
      status: 'pending',
      progress: 0,
      videoUrl: body.videoUrl,
    })

    const messages: ChatUIMessage[] = [userMessage, assistantMessage]

    await upsertChatState({
      threadId: body.threadId,
      user: { id: user.id, email: user.email },
      supabase,
      messages,
      taskIdToBind: taskId,
    })

    return NextResponse.json({
      task_id: taskId,
      messages,
    })
  } catch (error) {
    console.error('[API/Chat] Direct submit failed:', error)
    return NextResponse.json(
      {
        error: 'Direct submit failed',
        code: 'DIRECT_SUBMIT_FAILED',
        details: error instanceof Error ? error.message : 'Unexpected error',
      },
      { status: 500 }
    )
  }
}
