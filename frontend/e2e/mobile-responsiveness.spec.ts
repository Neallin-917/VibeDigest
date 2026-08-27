import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness', () => {
  // Set viewport to iPhone SE size
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page, context }) => {
    // 0. Inject Auth Bypass Cookie to access protected /chat route directly
    await context.addCookies([
      {
        name: 'VIBEDIGEST_E2E_AUTH_BYPASS',
        value: 'true',
        domain: 'localhost',
        path: '/',
      }
    ]);

    // Mock Auth User Response
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'tester@vibedigest.io',
          user_metadata: { full_name: 'Test User' }
        })
      });
    });

    // Mock Chat Threads
    await page.route('**/api/chat/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Mock DB calls
    await page.route('**/rest/v1/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
    });
  });

  test('should show hamburger menu and hide sidebar on mobile', async ({ page }) => {
    await page.goto('/en/chat');

    // 1. Verify desktop sidebar is HIDDEN
    // The sidebar usually is an <aside> element with classes like 'hidden md:flex'
    // Use .first() to avoid strict mode violation if multiple asides exist
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeHidden();

    // 2. Verify Hamburger menu button is VISIBLE
    const hamburgerBtn = page.getByRole('button', { name: /Open menu/i }).first();
    await expect(hamburgerBtn).toBeVisible({ timeout: 15000 });

    // 3. Click Hamburger menu
    await hamburgerBtn.click();

    // 4. Verify Drawer opens and shows navigation items
    // Use getByRole inside the dialog to be precise and avoid strict mode issues with desktop sidebar
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('button', { name: /New Chat|新对话/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByRole('button', { name: /Podcast library|播客库/i }).first()).toBeVisible({ timeout: 10000 });

    // 5. Click close/overlay and verify Drawer closes
    await page.keyboard.press('Escape');
    
    // Wait for animation to complete
    await expect(drawer).not.toBeVisible({ timeout: 10000 });
  });
});
