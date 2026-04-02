import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/mock-api';

test.describe('Visual Regression', () => {
  test('Landing Page visual check', async ({ page }, testInfo) => {
    // Visual regression snapshots are platform-specific (darwin vs linux differ in fonts/rendering).
    // Run locally only to update baselines: npx playwright test --update-snapshots
    test.skip(!!process.env.CI, 'Visual regression snapshots must be generated per-platform locally');

    // Use setupApiMocks to ensure consistent API responses (includes blockExternalImages)
    await setupApiMocks(page);

    // Visit Landing Page
    await page.goto('/en');

    // Wait for Hero to be visible
    await expect(page.locator('h1')).toBeVisible();

    // Take screenshot and compare
    // Note: This will fail on the first run. 
    // Run `npx playwright test --update-snapshots` to generate the baseline.
    // CommunityTemplates loads dynamic data at SSR time (before page.route() applies),
    // so page height and content may vary between runs. Use maxDiffPixelRatio for tolerance.
    await expect(page).toHaveScreenshot('landing-page.png', {
      maxDiffPixelRatio: 0.25,
      fullPage: true
    });
  });
});
