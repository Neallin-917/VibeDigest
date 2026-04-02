import { test, expect } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api';

/**
 * Journey 1.1: Landing Page -> Chat Flow
 * 
 * Given: Anonymous user on Landing Page
 * When: Enters URL and clicks Generate
 * Then: Redirects to Login, and (in a real flow) eventually to Chat with the task.
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
        
        await page.goto('/en')

        // Find the URL input on landing page (use first() to avoid strict mode if multiple exist)
        const urlInput = page.getByLabel(/Chat input/i).first()
        await expect(urlInput).toBeVisible()

        // Type a valid URL
        await urlInput.fill('https://youtube.com/watch?v=testVideo123')

        // Click generate button
        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).filter({ visible: true }).first()
        await generateBtn.click()

        // Should redirect to login
        await page.waitForURL(/\/login/, { timeout: 30000 });
        await expect(page).toHaveURL(/\/login/)
    })

    test('should disable button for empty URL', async ({ page }) => {
        await page.goto('/en')

        // Send button should be disabled when input is empty
        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).first()
        await expect(generateBtn).toBeDisabled()
    })

    test('should show error for invalid URL format', async ({ page }) => {
        await page.goto('/en')

        const urlInput = page.getByLabel(/Chat input/i).first()
        await urlInput.fill('not-a-valid-url')

        const generateBtn = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).first()
        await generateBtn.click()

        // Should show URL help dialog or error
        // The dialog usually has a role="dialog"
        const dialog = page.getByRole('dialog').first()
        await expect(dialog).toBeVisible({ timeout: 5000 })
        await expect(dialog).toContainText(/Supported platforms|Use specific URL/i)
    })
})
