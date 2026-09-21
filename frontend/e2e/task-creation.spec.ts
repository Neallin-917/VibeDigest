import { test, expect } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api';

/**
 * Journey 1.1: Landing Page -> Chat Flow
 * 
 * Given: Anonymous user on Landing Page
 * When: Enters URL and clicks Generate
 * Then: Redirects to Login with clear confirmation that the submitted link is preserved.
 * 
 * Note: We cannot easily mock the full auth flow across redirects in a simple E2E 
 * without more complex setup, so we focus on the landing page interaction 
 * and the expected redirect.
 */
test.describe('Landing Page Acquisition Flow', () => {

    test.beforeEach(async ({ page }) => {
        await setupApiMocks(page, { isAuthenticated: false });
    });

    test('submitting URL on landing page redirects to login (if unauthenticated)', async ({ page, context }) => {
        // Ensure no cookies exist to force unauthenticated state
        await context.clearCookies();
        await page.setViewportSize({ width: 390, height: 844 })
        const chatRequests: string[] = []
        page.on('request', request => {
            if (request.url().includes('/api/chat')) chatRequests.push(request.url())
        })
        
        await page.goto('/en')

        // Find the URL input on landing page (use first() to avoid strict mode if multiple exist)
        const urlInput = page.getByLabel(/Video or podcast URL/i).first()
        await expect(urlInput).toBeVisible()

        // Type a valid URL
        const originalUrl = 'https://youtube.com/watch?v=testVideo123&list=playlist#t=42'
        await urlInput.fill(originalUrl)

        // Click generate button
        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).filter({ visible: true }).first()
        await generateBtn.click()

        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 30000 });
        await expect(page).toHaveURL(/\/login/)
        await expect(page.getByText('Link saved')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Continue' })).toBeVisible()
        const handoff = page.getByRole('region', { name: 'Saved source and next steps' })
        await expect(handoff).toContainText('Source')
        await expect(handoff).toContainText('YouTube')
        await expect(handoff.getByRole('link', { name: originalUrl })).toHaveAttribute('href', originalUrl)

        const retainedMessage = await page.evaluate(() => localStorage.getItem('vibedigest_pending_message'))
        expect(retainedMessage).toBe(originalUrl)
        expect(chatRequests).toEqual([])

        const widthAudit = await page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
        }))
        expect(widthAudit.document).toBe(widthAudit.viewport)
    })

    test('ordinary chat handoff uses request copy instead of source copy', async ({ page, context }) => {
        await context.clearCookies()
        await page.goto('/en')
        await page.evaluate(() => {
            localStorage.setItem('vibedigest_pending_message', 'What is the main risk?')
        })

        await page.goto('/en/login?next=%2Fen%2Fchat')

        await expect(page.getByText('Request saved')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Continue' })).toBeVisible()
        await expect(page.getByRole('region', { name: 'Saved source and next steps' })).toHaveCount(0)
        await expect.poll(() => page.evaluate(() => localStorage.getItem('vibedigest_pending_message')))
            .toBe('What is the main risk?')
    })

    test('should disable button for empty URL', async ({ page }) => {
        await page.goto('/en')

        // Send button should be disabled when input is empty
        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).first()
        await expect(generateBtn).toBeDisabled()
    })

    test('should show error for invalid URL format', async ({ page }) => {
        await page.goto('/en')

        const urlInput = page.getByLabel(/Video or podcast URL/i).first()
        await urlInput.fill('not-a-valid-url')

        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).first()
        await generateBtn.click()

        const error = page.locator('#hero').getByRole('alert')
        await expect(error).toBeVisible()
        await expect(error).toHaveText('Paste a video or episode link from YouTube, Apple Podcasts, Bilibili, or Xiaoyuzhou.')
        await expect(urlInput).toHaveAttribute('aria-invalid', 'true')
        await expect(urlInput).toHaveAttribute('aria-describedby', await error.getAttribute('id') as string)
        await expect(urlInput).toBeFocused()
        await expect(urlInput).toHaveValue('not-a-valid-url')
        await expect(page.getByRole('dialog')).toHaveCount(0)

        await urlInput.fill('https://www.youtube.com/watch?v=testVideo123')
        await expect(error).toHaveCount(0)
        await expect(urlInput).not.toHaveAttribute('aria-invalid', 'true')
    })
})
