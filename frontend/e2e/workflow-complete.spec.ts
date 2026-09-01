import { expect, test, type Route } from '@playwright/test'

import { ChatPage } from './pages/ChatPage'
import { createMockTask, createMockTaskOutput } from './fixtures/testData'
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

test.describe('Complete Task Workflow (Mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })

    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON() as {
        threadId: string
        taskId?: string | null
        locale: string
        scope: string
        message: { role: string; parts: Array<{ type: string; text: string }> }
      }

      expect(body).toMatchObject({
        threadId: expect.any(String),
        taskId: null,
        locale: 'en',
        scope: 'workspace',
        message: {
          role: 'user',
          parts: [{ type: 'text', text: 'https://youtube.com/watch?v=dQw4w9WgXcQ' }],
        },
      })

      await fulfillUiMessageStream(route, [
        {
          type: 'start',
          messageId: 'agent:mock-turn:reply',
          messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'running' },
        },
        {
          type: 'data-task-status',
          id: 'task-status-mock-task-123',
          data: {
            taskId: 'mock-task-123',
            status: 'completed',
            progress: 100,
            videoTitle: 'Never Gonna Give You Up',
            videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
          },
        },
        { type: 'text-start', id: 'answer' },
        { type: 'text-delta', id: 'answer', delta: 'I have created a task for you.' },
        { type: 'text-end', id: 'answer' },
        {
          type: 'finish',
          messageMetadata: { runtime: 'api', provider: 'openrouter', modelTier: 'smart', agentState: 'completed' },
        },
      ])
    })

    await page.route('**/rest/v1/tasks*', async (route) => {
      const url = route.request().url()
      const isSingle = route.request().headers().accept?.includes('vnd.pgrst.object')

      if (url.includes('id=eq.mock-task-123')) {
        const data = createMockTask({
          id: 'mock-task-123',
          video_title: 'Never Gonna Give You Up',
          video_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
          status: 'completed',
          progress: 100,
        })

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(isSingle ? data : [data]),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/rest/v1/task_outputs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockTaskOutput('summary', {
            version: 4,
            language: 'en',
            overview: 'AI Summary Content',
            keypoints: [{
              title: 'Intro',
              detail: 'The beginning',
              evidence: 'The video opens with the introduction.',
              startSeconds: 0,
            }],
            sections: [],
          }),
          createMockTaskOutput('script', '00:00 - Intro'),
        ]),
      })
    })

    await page.route('**/api/threads*', async (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()

      if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-thread-123',
            title: 'New Chat',
            status: 'active',
            task_id: 'mock-task-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        })
        return
      }

      if (url.pathname.endsWith('/api/threads') && url.searchParams.get('taskId') === 'mock-task-123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/api/chat/threads/*/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })
  })

  test('keeps the welcome surface usable while the task thread is resolving', async ({ page }) => {
    let releaseThreadLookup!: () => void
    const threadLookupGate = new Promise<void>((resolve) => {
      releaseThreadLookup = resolve
    })

    await page.route('**/api/threads*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/api/threads') && url.searchParams.get('taskId') === 'mock-task-123') {
        await threadLookupGate
      }

      await route.fallback()
    })

    await page.goto('/en/chat?task=mock-task-123')

    await expect(page.getByText('Opening chat...')).toHaveCount(0)
    await expect(page.locator('h1')).toContainText(/What do you want to understand\?/i)
    await expect(page.getByText('Processing plan')).toBeHidden()
    await expect(page.getByLabel(/Chat input/i)).toBeEnabled()

    releaseThreadLookup()

    await expect(page).toHaveURL(/threadId=/, { timeout: 10000 })
    await expect(page.getByLabel(/Chat input/i)).toBeEnabled()
  })

  test('user can submit a video and see the completed results', async ({ page }) => {
    const chatPage = new ChatPage(page)

    await chatPage.goto()
    await expect(chatPage.welcomeHeading).toContainText(/What do you want to understand\?/i)
    await expect(page).toHaveURL(/threadId=/)
    const initialThreadId = new URL(page.url()).searchParams.get('threadId')

    await chatPage.submitMessage('https://youtube.com/watch?v=dQw4w9WgXcQ')

    const artifact = page.getByTestId('inline-task-artifact')
    await expect(artifact).toBeVisible()
    await expect(artifact.getByTitle('Never Gonna Give You Up')).toBeVisible()
    await expect(artifact.getByText('AI Summary Content')).toBeVisible()
    await expect(artifact.getByRole('heading', { name: 'Key Points' })).toBeVisible()
    await expect(artifact.getByRole('list').getByText('Intro', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/task=mock-task-123/)
    expect(new URL(page.url()).searchParams.get('threadId')).toBe(initialThreadId)
  })
})
