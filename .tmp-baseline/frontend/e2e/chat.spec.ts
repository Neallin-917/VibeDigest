import { test, expect } from '@playwright/test'
import { ChatPage } from './pages/ChatPage'
import { createMockTask, createMockUser } from './fixtures/testData'
import { setupApiMocks } from './fixtures/mock-api'

test.describe('Chat Interface Flow', () => {

  test.beforeEach(async ({ page }) => {
    // 0. Setup auth mocks - inject fake session so Supabase client sees isAuthenticated=true
    await setupApiMocks(page, { isAuthenticated: true })

    // 1. Mock Process Video API
    await page.route('**/api/process-video', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ taskId: 'task-e2e-123' })
      })
    })

    // 2. Mock Chat API (AI SDK)
    await page.route('**/api/chat', async (route) => {
      // AI SDK v6 expects a stream, but for basic text response mocking:
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'I am analyzing the video for you. https://youtube.com/watch?v=e2e'
      })
    })

    // 3. Mock Supabase Tasks (Realtime/Fetch)
    await page.route('**/rest/v1/tasks*', async (route) => {
      const url = route.request().url()
      if (url.includes('id=eq.task-e2e-123')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([createMockTask({
            id: 'task-e2e-123',
            video_title: 'E2E Test Video',
            video_url: 'https://youtube.com/watch?v=e2e',
            thumbnail_url: 'https://placehold.co/600x400',
            status: 'processing',
            progress: 20,
            user_id: 'test-user'
          })])
        })
      } else if (url.includes('is_demo=eq.true')) {
        // Mock demo tasks for Welcome Screen
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      } else {
        // Default empty list for other queries (like initial sidebar load)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      }
    })

    // 4. Mock Task Outputs
    await page.route('**/rest/v1/task_outputs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    // 5. Mock Auth User (If app checks auth via Supabase)
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockUser({ id: 'test-user', email: 'test@example.com' }))
      })
    })

    // 6. Mock Threads (both paths: legacy /api/chat/threads and new /api/threads)
    await page.route('**/api/chat/threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    await page.route('**/api/threads*', async (route) => {
      const method = route.request().method()
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-thread-e2e', task_id: 'task-e2e-123' })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      }
    })
  })

  test.beforeEach(async ({ page }) => {
    // Capture console logs
    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`))
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`))
  })

  test('chat page is accessible and shows welcome screen for authenticated users', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // Navigate to Chat - now publicly accessible
    await chatPage.goto();

    // Should stay on /chat (no redirect to login)
    await expect(page).toHaveURL(/.*\/chat/);

    // Wait for React hydration and Welcome Screen
    await expect(chatPage.welcomeHeading).toContainText(/Welcome|VibeDigest|digest today/i)

    // Paste URL and Submit (mock auth returns authenticated user)
    await chatPage.submitMessage('https://youtube.com/watch?v=e2e');

    // Verify Chat Message appears (The user message)
    await chatPage.expectMessageVisible('https://youtube.com/watch?v=e2e');
  })
})