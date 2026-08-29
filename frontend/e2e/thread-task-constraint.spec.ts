import { expect, test, type Route } from '@playwright/test'

import { setupApiMocks } from './fixtures/mock-api'

function encodeUiMessageStream(chunks: unknown[]) {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
}

async function fulfillUiMessageStream(route: Route, chunks: unknown[]) {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    headers: {
      'cache-control': 'no-cache',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
    body: encodeUiMessageStream(chunks),
  })
}

test.describe('Thread-Task 1:1 Constraint', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })
  })

  test('should prevent creating a second task in the same thread', async ({ page }) => {
    const chatBodies: Array<{ threadId: string; taskId?: string | null; text: string }> = []

    await page.route('**/api/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON() as {
        threadId: string
        taskId?: string | null
        message: { parts: Array<{ type: string; text: string }> }
      }
      const text = body.message.parts[0]?.text ?? ''
      chatBodies.push({ threadId: body.threadId, taskId: body.taskId, text })

      if (chatBodies.length === 1) {
        await fulfillUiMessageStream(route, [
          {
            type: 'start',
            messageId: 'agent:thread-constraint:reply-1',
            messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'running' },
          },
          {
            type: 'data-task-status',
            id: 'task-status-task-123',
            data: {
              taskId: 'task-123',
              status: 'pending',
              progress: 0,
              videoUrl: 'https://www.youtube.com/watch?v=test1',
            },
          },
          {
            type: 'finish',
            messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'waiting_task' },
          },
        ])
        return
      }

      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'This action is not available in the current conversation.' }),
      })
    })

    await page.goto('/en/chat')
    await expect(page).toHaveURL(/threadId=/)

    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('https://www.youtube.com/watch?v=test1')
    await chatInput.press('Enter')

    await expect.poll(() => chatBodies.length).toBe(1)
    expect(chatBodies[0]).toMatchObject({
      taskId: null,
      text: 'https://www.youtube.com/watch?v=test1',
    })

    const boundThreadId = chatBodies[0]?.threadId
    await expect(page).toHaveURL(/task=task-123/)
    expect(new URL(page.url()).searchParams.get('threadId')).toBe(boundThreadId)

    await chatInput.fill('https://www.youtube.com/watch?v=test2')
    await chatInput.press('Enter')

    await expect.poll(() => chatBodies.length).toBe(2)
    expect(chatBodies[1]).toMatchObject({
      threadId: boundThreadId,
      taskId: 'task-123',
      text: 'https://www.youtube.com/watch?v=test2',
    })

    await expect(page.getByText('Something went wrong.')).toBeVisible()
    expect(new URL(page.url()).searchParams.get('task')).toBe('task-123')
  })

  test('should allow creating task in new thread after constraint error', async ({ page }) => {
    const chatBodies: Array<{ threadId: string; taskId?: string | null; text: string }> = []

    await page.route('**/api/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'thread-with-task',
            title: 'Existing task thread',
            status: 'active',
            task_id: 'task-123',
            updated_at: new Date().toISOString(),
          },
        ]),
      })
    })

    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON() as {
        threadId: string
        taskId?: string | null
        message: { parts: Array<{ type: string; text: string }> }
      }
      chatBodies.push({
        threadId: body.threadId,
        taskId: body.taskId,
        text: body.message.parts[0]?.text ?? '',
      })

      await fulfillUiMessageStream(route, [
        {
          type: 'start',
          messageId: 'agent:new-thread:reply',
          messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'running' },
        },
        {
          type: 'data-task-status',
          id: 'task-status-task-new-thread',
          data: {
            taskId: 'task-new-thread',
            status: 'pending',
            progress: 0,
            videoUrl: 'https://www.youtube.com/watch?v=new-video',
          },
        },
        {
          type: 'finish',
          messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'waiting_task' },
        },
      ])
    })

    await page.goto('/en/chat?threadId=thread-with-task&task=task-123')
    await page.waitForLoadState('networkidle')

    const previousThreadId = new URL(page.url()).searchParams.get('threadId')
    expect(previousThreadId).toBe('thread-with-task')

    await page.getByRole('button', { name: /new chat/i }).click()
    await page.waitForURL((url) => {
      return url.pathname === '/en/chat'
        && url.searchParams.has('threadId')
        && !url.searchParams.has('task')
    })

    const newThreadId = new URL(page.url()).searchParams.get('threadId')
    expect(newThreadId).not.toBe(previousThreadId)

    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('https://www.youtube.com/watch?v=new-video')
    await chatInput.press('Enter')

    await expect.poll(() => chatBodies.length).toBe(1)
    expect(chatBodies[0]).toMatchObject({
      threadId: newThreadId,
      taskId: null,
      text: 'https://www.youtube.com/watch?v=new-video',
    })
    await expect(page).toHaveURL(/task=task-new-thread/)
  })
})

test.describe('Navigation Cycle Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })
  })

  test('should detect and prevent navigation cycles', async ({ page }) => {
    const navigationHistory: string[] = []

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationHistory.push(frame.url())
      }
    })

    await page.route('**/api/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'thread-a', task_id: 'task-a', title: 'Thread A', status: 'active', updated_at: new Date().toISOString() },
          { id: 'thread-b', task_id: 'task-b', title: 'Thread B', status: 'active', updated_at: new Date().toISOString() },
        ]),
      })
    })

    await page.goto('/en/chat?threadId=thread-a&task=task-a')
    await page.waitForLoadState('networkidle')

    await page.goto('/en/chat?threadId=thread-b&task=task-b')
    await page.goto('/en/chat?threadId=thread-a&task=task-a')
    await page.goto('/en/chat?threadId=thread-b&task=task-b')
    await page.waitForTimeout(500)

    const finalUrl = page.url()
    const uniqueUrls = new Set(navigationHistory)

    expect(uniqueUrls.size).toBeLessThanOrEqual(5)
    expect(finalUrl).toMatch(/threadId=(thread-a|thread-b)/)
  })

  test('should allow normal navigation without false positives', async ({ page }) => {
    await page.route('**/api/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/en/chat?threadId=thread-1&task=task-1')
    await expect(page).toHaveURL(/threadId=thread-1/)

    await page.waitForTimeout(3000)

    await page.goto('/en/chat?threadId=thread-1&task=task-1')
    await expect(page).toHaveURL(/threadId=thread-1/)
  })
})
