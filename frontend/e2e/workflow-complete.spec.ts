import { test, expect } from '@playwright/test'
import { ChatPage } from './pages/ChatPage'
import { createMockTask, createMockTaskOutput } from './fixtures/testData'
import { setupApiMocks } from './fixtures/mock-api'

test.describe('Complete Task Workflow (Mocked)', () => {

  test.beforeEach(async ({ page }) => {
    // Setup auth mocks - inject fake session so Supabase client sees isAuthenticated=true
    await setupApiMocks(page, { isAuthenticated: true })

    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'I have created a task for you.'
      })
    })

    await page.route('**/api/chat/direct-submit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          task_id: 'mock-task-123',
          messages: [
            {
              id: 'mock-user-message',
              role: 'user',
              parts: [{ type: 'text', text: 'https://youtube.com/watch?v=dQw4w9WgXcQ' }],
            },
            {
              id: 'mock-assistant-message',
              role: 'assistant',
              parts: [
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
              ],
            },
          ],
        }),
      })
    })

    await page.route('**/rest/v1/tasks*', async (route) => {
      const url = route.request().url();
      const isSingle = route.request().headers()['accept']?.includes('vnd.pgrst.object');
      
      if (url.includes('id=eq.mock-task-123')) {
        const data = createMockTask({
            status: 'completed',
            progress: 100,
        });
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(isSingle ? data : [data])
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      }
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
                startSeconds: 0
              }],
              sections: []
          }),
          createMockTaskOutput('script', '00:00 - Intro')
        ])
      })
    })

    // Mock Threads API (needed for resolveOrCreateThreadForTask and fetchThreadTaskId)
    await page.route('**/api/threads*', async (route) => {
      const method = route.request().method()
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-thread-123', task_id: 'mock-task-123' })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      }
    })

    // Mock Chat Threads API (legacy path)
    await page.route('**/api/chat/threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })
  })

  test('keeps the welcome surface usable while the task thread is resolving', async ({ page }) => {
    let releaseThreadLookup!: () => void
    const threadLookupGate = new Promise<void>((resolve) => {
      releaseThreadLookup = resolve
    })

    await page.route(/\/api\/threads\?taskId=mock-task-123$/, async (route) => {
      await threadLookupGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/en/chat?task=mock-task-123')

    await expect(page.getByText('Opening chat...')).toBeVisible({ timeout: 1500 })
    await expect(page.locator('h1')).toContainText(/What do you want to understand today\?/i)
    await expect(page.getByText('Processing plan')).toBeHidden()
    await expect(page.getByLabel(/Chat input/i)).toBeEnabled()

    releaseThreadLookup()

    await expect(page).toHaveURL(/threadId=/, { timeout: 10000 })
    await expect(page.getByLabel(/Chat input/i)).toBeEnabled()
  })

  test('user can submit a video and see the completed results', async ({ page }) => {
    const chatPage = new ChatPage(page);

    await chatPage.goto();
    await expect(chatPage.welcomeHeading).toContainText(/What do you want to understand today\?/i);

    await chatPage.submitMessage('https://youtube.com/watch?v=dQw4w9WgXcQ');

    const artifact = page.getByTestId('inline-task-artifact')
    await expect(artifact).toBeVisible()
    await expect(artifact.getByTitle('Never Gonna Give You Up')).toBeVisible()
    await expect(artifact.getByText('AI Summary Content')).toBeVisible()
    await expect(artifact.getByRole('heading', { name: 'Key Points' })).toBeVisible()
    await expect(artifact.getByRole('list').getByText('Intro', { exact: true })).toBeVisible()
  })
})
