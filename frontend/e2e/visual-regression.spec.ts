import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/mock-api';

test.describe('Visual Regression', () => {
  test('Landing hero visual check', async ({ page }) => {
    // Visual baselines are OS-specific and intentionally ignored by Git. They are
    // a deliberate local review, not a dependency of the deterministic E2E suite.
    test.skip(process.env.RUN_VISUAL_REGRESSION !== '1', 'Set RUN_VISUAL_REGRESSION=1 for local visual review');

    // Use setupApiMocks to ensure consistent API responses (includes blockExternalImages)
    await setupApiMocks(page);

    // Visit Landing Page
    await page.goto('/en');

    // Wait for Hero to be visible
    await expect(page.locator('h1')).toBeVisible();

    // Keep the visual target independent of server-rendered community data.
    await expect(page.locator('#hero')).toHaveScreenshot('landing-hero.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
