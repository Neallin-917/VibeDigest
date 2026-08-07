import { expect, test } from '@playwright/test'

import { ChatPage } from './pages/ChatPage'
import { setupApiMocks } from './fixtures/mock-api'

test.describe('Inline agent task artifact', () => {
  test('progressively adds the player and knowledge cards in the same chat message', async ({ page }) => {
    await setupApiMocks(page, { isAuthenticated: true })

    let releaseSummary!: () => void
    const summaryGate = new Promise<void>((resolve) => {
      releaseSummary = resolve
    })

    await page.route('**/api/chat/direct-submit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          task_id: 'inline-task-123',
          messages: [
            {
              id: 'inline-user',
              role: 'user',
              parts: [{ type: 'text', text: 'https://www.youtube.com/watch?v=inline-video' }],
            },
            {
              id: 'inline-assistant',
              role: 'assistant',
              parts: [
                {
                  type: 'data-task-status',
                  id: 'task-status-inline-task-123',
                  data: {
                    taskId: 'inline-task-123',
                    status: 'processing',
                    progress: 15,
                    videoUrl: 'https://www.youtube.com/watch?v=inline-video',
                  },
                },
              ],
            },
          ],
        }),
      })
    })

    await page.route('**/rest/v1/tasks*', async (route) => {
      const requestUrl = route.request().url()
      if (!requestUrl.includes('id=eq.inline-task-123')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }

      const task = {
        id: 'inline-task-123',
        status: 'processing',
        progress: 25,
        video_title: 'Inline source',
        thumbnail_url: 'https://i.ytimg.com/vi/inline-video/hqdefault.jpg',
        video_url: 'https://www.youtube.com/watch?v=inline-video',
      }
      const acceptsObject = route.request().headers().accept?.includes('vnd.pgrst.object')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(acceptsObject ? task : [task]),
      })
    })

    await page.route('**/rest/v1/task_outputs*', async (route) => {
      await summaryGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            kind: 'summary',
            status: 'completed',
            locale: 'en',
            content: JSON.stringify({
              version: 5,
              language: 'en',
              tl_dr: 'Deliberate practice becomes useful when feedback is immediate.',
              overview: 'A short overview.',
              keypoints: [
                { title: 'Feedback loops', detail: 'Review the outcome after each attempt.', evidence: '00:42' },
                { title: 'Protected focus', detail: 'Reserve uninterrupted practice time.', evidence: '01:24' },
                { title: 'Not rendered', detail: 'The first screen stays concise.', evidence: '02:10' },
              ],
              ui_blocks: [
                {
                  kind: 'comparison_table',
                  id: 'practice-comparison',
                  title: 'Practice modes',
                  columns: ['Delayed review', 'Immediate review'],
                  rows: [
                    { label: 'Feedback', values: ['After the session', 'After each attempt'], evidence: 'Feedback should be immediate.' },
                    { label: 'Adjustment', values: ['Harder to isolate', 'Visible in the next repetition'], evidence: 'Review the outcome after each attempt.' },
                  ],
                },
                {
                  kind: 'bar_chart',
                  id: 'practice-counts',
                  title: 'Verified repetitions',
                  unit: 'repetitions',
                  values: [
                    { label: 'Observe', value: 3, evidence: 'Observe three repetitions.' },
                    { label: 'Adjust', value: 5, evidence: 'Adjust after five repetitions.' },
                    { label: 'Repeat', value: 8, evidence: 'Repeat eight times.' },
                  ],
                },
              ],
              sections: [],
            }),
            created_at: '2026-08-06T00:00:00Z',
          },
        ]),
      })
    })

    const chatPage = new ChatPage(page)
    await chatPage.goto()
    await chatPage.submitMessage('https://www.youtube.com/watch?v=inline-video')

    const artifact = page.getByTestId('inline-task-artifact')
    await expect(artifact).toBeVisible()
    await expect(page.getByTitle('Inline source')).toBeVisible()
    await expect(page.locator('.cursor-col-resize')).toHaveCount(0)
    await expect(page.getByText('Context Panel')).toHaveCount(0)

    releaseSummary()

    await expect(artifact.getByRole('heading', { name: 'Brief' })).toBeVisible()
    await expect(artifact.getByText('Deliberate practice becomes useful when feedback is immediate.')).toBeVisible()
    await expect(artifact.getByRole('heading', { name: 'Key Points' })).toBeVisible()
    const keyPoints = artifact.getByRole('list')
    await expect(keyPoints.getByText('Feedback loops', { exact: true })).toBeVisible()
    await expect(keyPoints.getByText('Protected focus', { exact: true })).toBeVisible()
    await expect(artifact.getByRole('heading', { name: 'Practice modes' })).toBeVisible()
    await expect(artifact.getByRole('table')).toBeVisible()
    await expect(artifact.getByText('Immediate review')).toBeVisible()
    await expect(artifact.getByRole('heading', { name: 'Verified repetitions' })).toBeVisible()
    await expect(artifact.getByText('8 repetitions')).toBeVisible()
    await expect(artifact.getByText('Not rendered')).toHaveCount(0)
    await expect(artifact.getByText('00:42')).toHaveCount(0)
  })
})
