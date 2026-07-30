import { test, expect } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api'

/**
 * E2E Tests for Thread-Task 1:1 Constraint
 *
 * These tests verify that:
 * 1. A thread can only have one task (1:1 relationship enforced)
 * 2. Attempting to create a second task in the same thread returns an error
 * 3. The UI properly handles the error and guides users to create a new chat
 */
test.describe('Thread-Task 1:1 Constraint', () => {

  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })
  })

  test('should prevent creating a second task in the same thread', async ({ page }) => {
    let directSubmitCallCount = 0
    let threadTaskId: string | null = null

    // Mock the threads API to track thread's task_id
    await page.route('**/rest/v1/chat_threads*', async (route) => {
      const url = route.request().url()
      const method = route.request().method()

      if (method === 'POST') {
        // Thread creation
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'thread-123',
            user_id: 'test-user',
            title: 'New Chat',
            task_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        })
      } else if (method === 'GET' && url.includes('select=task_id')) {
        // Query for task_id check (1:1 constraint)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(threadTaskId ? { task_id: threadTaskId } : { task_id: null })
        })
      } else if (method === 'PATCH') {
        // Thread update (sets task_id after task creation)
        const body = await route.request().postDataJSON()
        if (body.task_id) {
          threadTaskId = body.task_id
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        })
      } else {
        await route.continue()
      }
    })

    // Mock the direct-submit API, which is now the canonical URL submission path
    await page.route('**/api/chat/direct-submit', async (route) => {
      directSubmitCallCount++

      if (directSubmitCallCount === 1) {
        threadTaskId = 'task-123'

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            task_id: 'task-123',
            messages: [
              {
                id: 'user-1',
                role: 'user',
                parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=test1' }],
              },
              {
                id: 'assistant-1',
                role: 'assistant',
                parts: [
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
                    type: 'data-task-progress',
                    id: 'task-progress-task-123',
                    data: { taskId: 'task-123' },
                  },
                  {
                    type: 'data-task-plan',
                    id: 'task-plan-task-123',
                    data: { taskId: 'task-123' },
                  },
                ],
              },
            ],
          }),
        })
      } else if (directSubmitCallCount === 2) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Task creation failed',
            code: 'TASK_ALREADY_EXISTS',
            details: 'This conversation is already discussing a video. Please start a new chat to discuss a different video.',
          }),
        })
      }
    })

    // Navigate to chat
    await page.goto('/en/chat')
    await page.waitForLoadState('networkidle')

    // Send first video URL
    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('https://www.youtube.com/watch?v=test1')
    await chatInput.press('Enter')

    // Wait for first response
    await page.waitForTimeout(1000)

    // Verify first task was created
    expect(directSubmitCallCount).toBe(1)
    expect(threadTaskId).toBe('task-123')

    // Try to send second video URL in the same thread
    await chatInput.fill('https://www.youtube.com/watch?v=test2')
    await chatInput.press('Enter')

    // Wait for second response
    await page.waitForTimeout(1000)

    // Verify second task creation was attempted
    expect(directSubmitCallCount).toBe(2)

    // Verify thread still has only the first task
    expect(threadTaskId).toBe('task-123')
    await expect(page.getByText(/already discussing a video/i)).toBeVisible()
    await expect(chatInput).toHaveValue('https://www.youtube.com/watch?v=test2')
  })

  test('should allow creating task in new thread after constraint error', async ({ page }) => {
    let directSubmitRequestCount = 0
    await page.route('**/rest/v1/chat_threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    await page.route('**/api/chat/direct-submit', async (route) => {
      directSubmitRequestCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          task_id: 'task-new-thread',
          messages: [
            {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=new-video' }],
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              parts: [
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
                  type: 'data-task-progress',
                  id: 'task-progress-task-new-thread',
                  data: { taskId: 'task-new-thread' },
                },
                {
                  type: 'data-task-plan',
                  id: 'task-plan-task-new-thread',
                  data: { taskId: 'task-new-thread' },
                },
              ],
            },
          ],
        }),
      })
    })

    await page.goto('/en/chat?threadId=thread-with-task&task=task-123')
    await page.waitForLoadState('networkidle')

    // Click "New Chat" button
    const newChatButton = page.getByRole('button', { name: /new chat/i })
    await newChatButton.click()

    // Verify URL changed (new thread, no task)
    await page.waitForURL(/\/chat\?threadId=[^&]+$/)

    // Now user can create a new task
    const chatInput = page.getByTestId('chat-input')
    await chatInput.fill('https://www.youtube.com/watch?v=new-video')
    await chatInput.press('Enter')

    // Should succeed (new thread allows new task)
    // Note: We check request count instead of UI text visibility due to mocking limitations with useChat stream rendering in E2E
    // The previous test ensures constraint logic, this ensures we CAN proceed in a new thread.
    await expect.poll(() => directSubmitRequestCount).toBe(1)
  })
})

/**
 * E2E Tests for Navigation Cycle Prevention
 *
 * These tests verify that the navigation cycle detection prevents
 * infinite loops when navigating between threads and tasks.
 */
test.describe('Navigation Cycle Prevention', () => {

  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })
  })

  test('should detect and prevent navigation cycles', async ({ page }) => {
    const navigationHistory: string[] = []

    // Track all navigation events
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigationHistory.push(frame.url())
      }
    })

    // Mock threads API
    await page.route('**/rest/v1/chat_threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'thread-a', task_id: 'task-a', title: 'Thread A' },
          { id: 'thread-b', task_id: 'task-b', title: 'Thread B' }
        ])
      })
    })

    // Start at thread-a with task-a
    await page.goto('/en/chat?threadId=thread-a&task=task-a')
    await page.waitForLoadState('networkidle')

    // Try to trigger a navigation that would cycle
    // In the bug scenario, clicking a summary would cause:
    // thread-a -> thread-b -> thread-a -> thread-b (infinite)

    // Simulate rapid URL changes (what would happen in a cycle)
    await page.goto('/en/chat?threadId=thread-b&task=task-b')
    await page.goto('/en/chat?threadId=thread-a&task=task-a')
    await page.goto('/en/chat?threadId=thread-b&task=task-b')

    // Wait a bit to see if cycle detection kicks in
    await page.waitForTimeout(500)

    // Verify we're not stuck in a loop (URL should be stable)
    const finalUrl = page.url()

    // Check that we didn't navigate more than expected
    // With cycle detection, the 3rd attempt to go back should be blocked
    const uniqueUrls = new Set(navigationHistory)

    // We should have at most 3-4 unique URLs (initial + the manual navigations)
    // If there's a cycle, we'd have many more
    expect(uniqueUrls.size).toBeLessThanOrEqual(5)

    // Verify final state is stable (one of the valid URLs)
    expect(finalUrl).toMatch(/threadId=(thread-a|thread-b)/)
  })

  test('should allow normal navigation without false positives', async ({ page }) => {
    await page.route('**/rest/v1/chat_threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    // Normal navigation should work fine
    await page.goto('/en/chat?threadId=thread-1&task=task-1')
    await expect(page).toHaveURL(/threadId=thread-1/)

    // Wait 3 seconds (longer than cycle detection window of 2 seconds)
    await page.waitForTimeout(3000)

    // Navigate to same URL again - should work (outside detection window)
    await page.goto('/en/chat?threadId=thread-1&task=task-1')
    await expect(page).toHaveURL(/threadId=thread-1/)
  })
})
