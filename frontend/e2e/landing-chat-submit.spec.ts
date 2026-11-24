import { expect, test, type Page } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api'

const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=42#details'
const reply = 'Received the video for processing.'
const user = { id: '80ade5ac-95d0-4775-987d-8dc71dc0205c', aud: 'authenticated', role: 'authenticated', email: 'landing@example.test' }

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Use password' }).click()
  await page.getByLabel('name@example.com').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

for (const signedIn of [true, false]) {
  test(`landing submits exactly once ${signedIn ? 'when already signed in' : 'after returning from sign-in'}`, async ({ page, context }) => {
    await context.clearCookies()
    await setupApiMocks(page)
    await page.route('**/auth/v1/user', route => route.fulfill({ json: user }))
    await page.route('**/auth/v1/token?grant_type=password', async route => {
      // The password form performs its normal redirect. The cookie supplies the
      // equivalent authenticated state to the project's test-mode route guard.
      await context.addCookies([{ name: 'VIBEDIGEST_E2E_AUTH_BYPASS', value: 'true', domain: 'localhost', path: '/' }])
      await route.fulfill({ json: {
        access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
        token_type: 'bearer', expires_in: 3600, user,
      } })
    })
    await page.route('**/rest/v1/profiles*', route => route.fulfill({ json: { tier: 'free', usage_count: 0, usage_limit: 3 } }))

    const submissions: { threadId: string; message: { id: string; role: string; parts: unknown[] } }[] = []
    const answer = { id: 'landing-answer', role: 'assistant', parts: [{ type: 'text', text: reply }] }
    await page.route('**/api/threads', route => route.fulfill({ json: submissions.length ? [
      { id: submissions[0].threadId, title: 'Submitted video', updated_at: new Date().toISOString() },
    ] : [] }))
    await page.route('**/api/threads/*', route => route.fulfill({ json: { task_id: null } }))
    await page.route('**/api/chat/threads/*/messages', route => route.fulfill({
      json: submissions.length ? [submissions[0].message, answer] : [],
    }))
    await page.route('**/api/chat', async route => {
      submissions.push(route.request().postDataJSON())
      await route.fulfill({
        contentType: 'text/event-stream',
        headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
        body: [
          { type: 'start', messageId: answer.id }, { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: reply }, { type: 'text-end', id: 'text' }, { type: 'finish' },
        ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
      })
    })

    if (signedIn) {
      await page.goto('/en/login?next=%2Fen')
      await signIn(page)
      await expect(page.getByRole('link', { name: 'Open app' })).toBeVisible()
    } else {
      await page.goto('/en')
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).toBeVisible()
    }
    await page.getByLabel('YouTube video URL').fill(videoUrl)
    await page.getByRole('button', { name: 'Create digest' }).click()

    if (!signedIn) {
      await expect(page).toHaveURL(/\/en\/login\?next=/)
      await expect(page.getByRole('link', { name: videoUrl })).toBeVisible()
      expect(submissions).toHaveLength(0)
      await signIn(page)
    }

    await expect(page).toHaveURL(/\/en\/chat\?threadId=/)
    const threadId = new URL(page.url()).searchParams.get('threadId')
    expect(threadId).toBeTruthy()
    await expect(page.getByText(reply, { exact: true })).toBeVisible()
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({
      threadId, scope: 'workspace', message: { role: 'user', parts: [{ type: 'text', text: videoUrl }] },
    })
    expect(await page.evaluate(() => localStorage.getItem('vibedigest_pending_message'))).toBeNull()

    await page.reload()
    await expect(page.getByText(reply, { exact: true })).toBeVisible()
    expect(submissions).toHaveLength(1)
  })
}
