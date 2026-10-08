import { expect, test } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api'

test('a saved source question survives the wrong source and resumes only on its original source', async ({ page }) => {
  await setupApiMocks(page, { isAuthenticated: true })
  await page.route('**/api/threads?taskId=*', route => route.fulfill({ json: [] }))
  const submissions: Record<string, unknown>[] = []
  await page.route('**/api/threads/*', route => route.fulfill({ json: { task_id: 'local-demo-latent-space' } }))
  await page.route('**/api/chat/threads/*/messages', route => route.fulfill({ json: submissions.length ? [
    { id: 'handoff-user', role: 'user', parts: [{ type: 'text', text: 'What does this source recommend?' }] },
    { id: 'handoff-reply', role: 'assistant', parts: [{ type: 'text', text: 'This answer belongs to the original source.' }] },
  ] : [] }))
  await page.route('**/api/chat', async route => {
    submissions.push(route.request().postDataJSON())
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: [
        { type: 'start', messageId: 'handoff-reply' },
        { type: 'text-start', id: 'answer' },
        { type: 'text-delta', id: 'answer', delta: 'This answer belongs to the original source.' },
        { type: 'text-end', id: 'answer' }, { type: 'finish' },
      ].map(part => `data: ${JSON.stringify(part)}\n\n`).join('') + 'data: [DONE]\n\n',
    })
  })
  await page.goto('/en')
  await page.evaluate(() => localStorage.setItem('vibedigest_pending_message', JSON.stringify({
    version: 1, text: 'What does this source recommend?', path: '/en/tasks/local-demo-latent-space/original-title',
    scope: 'source', taskId: 'local-demo-latent-space',
  })))
  await page.goto('/en/tasks/local-demo-casey/other-source')
  await expect(page.getByRole('textbox', { name: 'Follow-up question about this source' })).toBeVisible()
  expect(submissions).toHaveLength(0)
  expect(await page.evaluate(() => localStorage.getItem('vibedigest_pending_message'))).not.toBeNull()
  await page.screenshot({ path: '../output/playwright/handoff-sprint/source-b-preserved.png', fullPage: true })
  await page.goto('/zh/tasks/local-demo-latent-space/renamed-title')
  await expect.poll(() => submissions.length).toBe(1)
  await expect(page.getByText('This answer belongs to the original source.', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(1)
  expect(submissions[0]).toMatchObject({
    scope: 'source', taskId: 'local-demo-latent-space', locale: 'zh',
    message: { role: 'user', parts: [{ type: 'text', text: 'What does this source recommend?' }] },
  })
  expect(await page.evaluate(() => localStorage.getItem('vibedigest_pending_message'))).toBeNull()
  await page.screenshot({ path: '../output/playwright/handoff-sprint/source-a-resumed.png', fullPage: true })
})
