import { expect, test } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api'

const errorThreadId = 'error-thread'

test.describe('Tool error states', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })

    await page.route('**/api/chat/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: errorThreadId,
            title: 'Failed video request',
            task_id: null,
            status: 'active',
            updated_at: '2026-07-31T00:00:00Z',
          },
        ]),
      })
    })

    await page.route(`**/api/chat/threads/${errorThreadId}/messages`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'assistant-error',
            role: 'assistant',
            parts: [
              {
                type: 'tool-preview_video',
                toolCallId: 'preview-error',
                state: 'output-available',
                input: { video_url: 'https://youtube.com/watch?v=invalid' },
                output: { error: 'Failed to preview video' },
              },
              {
                type: 'tool-create_task',
                toolCallId: 'create-error',
                state: 'output-available',
                input: { video_url: 'https://youtube.com/watch?v=invalid' },
                output: { error: 'Failed to create task' },
              },
            ],
            metadata: { createdAt: '2026-07-31T00:00:00Z' },
          },
        ]),
      })
    })
  })

  test('shows one unambiguous error state for failed video tools', async ({ page }) => {
    await page.goto(`/en/chat?threadId=${errorThreadId}`)

    await expect(page.getByRole('button', { name: 'Video preview Error' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Processing Error' })).toBeVisible()
    await expect(page.getByText('Failed to preview video')).toBeVisible()
    await expect(page.getByText('Failed to create task')).toBeVisible()

    await expect(page.getByText('Completed', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Untitled Video', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Task created successfully!', { exact: true })).toHaveCount(0)
  })
})
