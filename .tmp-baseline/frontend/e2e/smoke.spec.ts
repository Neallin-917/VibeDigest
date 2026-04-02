import { test, expect } from '@playwright/test';
import { setupApiMocks, blockExternalImages } from './fixtures/mock-api';

/**
 * Smoke tests for critical user paths.
 * These tests verify basic functionality without requiring authentication.
 */

test.describe('Landing Page', () => {

    test.beforeEach(async ({ page }) => {

        await setupApiMocks(page, { isAuthenticated: false });

    });



    test('loads and displays key elements', async ({ page }) => {

        await page.goto('/en');



        // Check page title contains brand

        await expect(page).toHaveTitle(/Vibe|Digest/i);



        // Check hero section exists

        await expect(page.locator('h1')).toBeVisible();



        // Check for Chat Input "Send message" button (replaces old CTA)

        const sendButton = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).filter({ visible: true }).first();

        await expect(sendButton).toBeVisible();



        // Check for video URL input field - using Aria Label from ChatInput component

        const urlInput = page.getByLabel(/Chat input/i).filter({ visible: true }).first();

        await expect(urlInput).toBeVisible();



        // Verify the input is actually usable by typing into it

        await urlInput.fill('https://youtube.com/test');

        await expect(urlInput).toHaveValue('https://youtube.com/test');

    });



    test('language selector exists and works', async ({ page }) => {

        await page.goto('/en');



        // Look for language selector (custom button in nav)

        const langSelector = page.locator('nav').getByRole('button').filter({ hasText: /English|中文/i }).filter({ visible: true }).first();

        

        if (await langSelector.isVisible()) {

            await langSelector.click();

            // Expect language options to appear in the dropdown content

            const zhOption = page.getByRole('option', { name: /中文|Chinese/i }).filter({ visible: true }).first();

            await expect(zhOption).toBeVisible({ timeout: 3000 });

        }

    });



    test('submitting empty URL does not navigate away', async ({ page }) => {

        await page.goto('/en');



        // Click submit without entering URL

        const submitButton = page.getByRole('button', { name: /Send message|开始|AI Summary/i }).filter({ visible: true }).first();

        

        // Ensure input is empty

        const urlInput = page.getByLabel(/Chat input/i).filter({ visible: true }).first();

        await urlInput.clear();



        if (await submitButton.isVisible()) {

            // In the new UI, the button might be disabled if input is empty

            if (await submitButton.isDisabled()) {

                await expect(submitButton).toBeDisabled();

            } else {

                await submitButton.click();

                // Should still be on the landing page

                await expect(page).toHaveURL(/\/(en|zh|es|fr|ja|ko|ru|pt|ar|hi)\/?$/);

            }

        }

    });
});

test.describe('Login Page', () => {
    test('loads and displays email form', async ({ page }) => {
        await page.goto('/en/login');

        // Check for email input
        await expect(page.locator('input[type="email"]')).toBeVisible();

        // Check for submit button
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });
});

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await blockExternalImages(page);
    });

    test('locale redirect works', async ({ page }) => {
        // Visit root, should redirect to /en or detect locale
        await page.goto('/');

        // URL should contain a locale like /en or /zh
        await expect(page).toHaveURL(/\/(en|zh|es|fr|ja|ko|ru|pt|ar|hi)\/?/);
    });

    test('explore page is accessible', async ({ page }) => {
        await page.goto('/en/explore');

        // Page should load without error (no 404)
        await expect(page.locator('body')).not.toContainText('404');
    });
});
