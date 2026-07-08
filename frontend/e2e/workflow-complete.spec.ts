import { test, expect } from '@playwright/test'
import { ChatPage } from './pages/ChatPage'
import { TaskPage } from './pages/TaskPage'
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

    let taskStatus = 'processing';
    await page.route('**/rest/v1/tasks*', async (route) => {
      const url = route.request().url();
      const isSingle = route.request().headers()['accept']?.includes('vnd.pgrst.object');
      
      if (url.includes('id=eq.mock-task-123')) {
        const data = createMockTask({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            status: taskStatus as any,
            progress: taskStatus === 'processing' ? 45 : 100
        });
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(isSingle ? data : [data])
        })
        if (taskStatus === 'processing') taskStatus = 'completed';
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
              overview: 'AI Summary Content',
              keypoints: [{ title: 'Intro', detail: 'The beginning', startSeconds: 0 }]
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

  test('user can submit a video and see the completed results', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    const chatPage = new ChatPage(page);
    const taskPage = new TaskPage(page);

    await chatPage.goto();
    await expect(chatPage.welcomeHeading).toContainText(/digest today/i);

    await chatPage.submitMessage('https://youtube.com/watch?v=dQw4w9WgXcQ');

    // Simulate navigation to task details
    await page.goto('/en/chat?task=mock-task-123');
    
    await taskPage.expectTaskCardVisible('Never Gonna Give You Up');
    
    await taskPage.expectContentVisible('AI Summary Content');
    await expect(page.getByTestId('header-key-insights')).toBeVisible()
    await expect(page.getByText('Intro').last()).toBeVisible()
  })
})
