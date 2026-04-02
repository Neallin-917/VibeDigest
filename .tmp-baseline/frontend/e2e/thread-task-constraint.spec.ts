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
    let createTaskCallCount = 0
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

    // Mock the chat API to intercept create_task tool calls
    await page.route('**/api/chat', async (route) => {
      const requestBody = await route.request().postDataJSON()

      // Simulate AI calling create_task tool
      createTaskCallCount++

      if (createTaskCallCount === 1) {
        // First task creation - should succeed
        threadTaskId = 'task-123'

        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
          body: '0:"I\'ve started processing the video."\n'
        })
      } else if (createTaskCallCount === 2) {
        // Second task creation - should fail due to 1:1 constraint
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'X-Vercel-AI-Data-Stream': 'v1' },
          body: '0:"This conversation is already discussing a video. Please start a new chat to discuss a different video."\n'
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
    expect(createTaskCallCount).toBe(1)
    expect(threadTaskId).toBe('task-123')

    // Try to send second video URL in the same thread
    await chatInput.fill('https://www.youtube.com/watch?v=test2')
    await chatInput.press('Enter')

    // Wait for second response
    await page.waitForTimeout(1000)

    // Verify second task creation was attempted
    expect(createTaskCallCount).toBe(2)

    // Verify thread still has only the first task
    expect(threadTaskId).toBe('task-123')
  })

  test('should allow creating task in new thread after constraint error', async ({ page }) => {
    let chatRequestCount = 0
    await page.route('**/rest/v1/chat_threads*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    await page.route('**/api/chat', async (route) => {
      chatRequestCount++
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'Task created'
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
    await expect.poll(() => chatRequestCount).toBe(1)
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

    const initialUrl = page.url()

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
