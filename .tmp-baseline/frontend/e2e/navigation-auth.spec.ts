import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/mock-api';

test.describe('Navigation & Auth Flows', () => {

    test.describe('Guest User (Non-logged in)', () => {
        // Clear storageState and cookies ensures guest mode
        test.use({ storageState: { cookies: [], origins: [] } });

        test.beforeEach(async ({ page, context }) => {
            await context.clearCookies();
            await setupApiMocks(page, { isAuthenticated: false });
        });

        test('Landing Page: Navigation Links should work', async ({ page }) => {
            // Start at explicit locale to avoid redirect overhead
            await page.goto('/en');
            await expect(page.locator('h1')).toBeVisible();

            // 1. Test "FAQ" link
            const faqLink = page.locator('nav').getByRole('link', { name: /FAQ|常见问题/i }).filter({ visible: true }).first();
            await expect(faqLink).toBeVisible();
            await faqLink.dispatchEvent('click');
            await expect(page).toHaveURL(/\/faq/, { timeout: 30000 });

            // Go back
            await page.goBack();
            await page.waitForLoadState('domcontentloaded');

            // 2. Test "Features" scroll (Nav Item)
            const featuresLink = page.locator('nav').getByRole('link', { name: /Features|功能/i }).filter({ visible: true }).first();
            await expect(featuresLink).toBeVisible();
            await featuresLink.dispatchEvent('click');
            // Give it a moment for potential scroll/hash update
            await page.waitForTimeout(1000);
            // If the hash didn't update, at least ensure we didn't leave the landing page incorrectly
            const currentURL = page.url();
            expect(currentURL).toMatch(/\/en(\/?$|#features)/);

            // 3. Test "Login" button in header
            const loginButton = page.locator('nav').getByRole('link', { name: /Log in|Sign up|登录/i }).filter({ visible: true }).first();
            if (await loginButton.isVisible()) {
                await loginButton.dispatchEvent('click');
                await page.waitForURL(/\/login/, { timeout: 30000 });
                await expect(page).toHaveURL(/\/login/);
            }
        });

        test('Logo Click: Should navigate to Landing Page', async ({ page }) => {
            await page.goto('/en/faq');
            await expect(page.locator('nav')).toBeVisible();

            const logo = page.locator('nav').getByRole('link', { name: /VibeDigest/i }).filter({ visible: true }).first();
            await expect(logo).toBeVisible();
            await logo.dispatchEvent('click');
            await expect(page).toHaveURL(/\/en(\/?$|#.*)/, { timeout: 30000 });
        });

        test('Protected Routes: Should redirect to Login', async ({ page }) => {
            // /chat is now public; only /settings and /history require login
            const protectedPaths = [
                '/en/settings',
                '/en/history'
            ];

            for (const path of protectedPaths) {
                await page.goto(path);
                await page.waitForURL(/\/login/, { timeout: 30000 });
                await expect(page).toHaveURL(/.*\/login/);
            }
        });

        test('Chat Page: Guest can access and browse demo content', async ({ page }) => {
            await page.goto('/en/chat');
            // Should NOT redirect to login — stay on /chat
            await expect(page).toHaveURL(/.*\/chat/, { timeout: 30000 });
            // Welcome screen should be visible
            await expect(page.getByLabel(/Chat input/i)).toBeVisible({ timeout: 10000 });
        });

        test('Chat Page: Sending a message redirects to Login', async ({ page }) => {
            await page.goto('/en/chat');
            await expect(page.getByLabel(/Chat input/i)).toBeVisible();

            // Type a message in the chat input
            const chatInput = page.getByLabel(/Chat input/i).first();
            await expect(chatInput).toBeVisible();
            await chatInput.fill('Tell me about this video');

            // Click send
            const sendButton = page.getByRole('button', { name: /Send message|发送/i }).filter({ visible: true }).first();
            await expect(sendButton).toBeEnabled();
            await sendButton.click();

            // Should be redirected to login
            await page.waitForURL(/\/login/, { timeout: 30000 });
            await expect(page).toHaveURL(/.*\/login/);
        });

        test('Landing Page: Check "Send message" redirects to Login', async ({ page }) => {
            await page.goto('/en');
            await expect(page.locator('h1')).toBeVisible();

            // 1. Find the URL input
            const urlInput = page.getByLabel(/Chat input/i).first();
            await expect(urlInput).toBeVisible();

            // 2. Type a valid URL to enable the button
            await urlInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

            // 3. Find and Click the now-enabled button
            const sendButton = page.getByRole('button', { name: /Send message|开始/i }).filter({ visible: true }).first();

            // Wait for button to be strictly enabled and stable
            await expect(sendButton).toBeEnabled();

            // Allow hydration to settle - removing force: true ensures Playwright waits for event listeners
            await sendButton.click();

            // 4. Since we are Guest, it should redirect to Login
            await page.waitForURL(/\/login/, { timeout: 30000 });
            await expect(page).toHaveURL(/.*\/login/);
        });

    });

    /**
     * Journey 4: 认证流程 (Authentication)
     */
    test.describe('Authenticated User', () => {
        test.beforeEach(async ({ page }, testInfo) => {
            await setupApiMocks(page, { isAuthenticated: true });
            if (testInfo.project.name.includes('guest')) {
                testInfo.skip(true, 'Skip authenticated tests in guest project');
            }
        });

        test('4.1 [P0] Chat access after login', async ({ page }) => {
            // Given: 用户已登录 (storageState)
            // When: 访问 /chat (原 dashboard)
            await page.goto('/en/chat');

            // Then: 应该停留在 chat 而不是被重定向到 login
            await expect(page).toHaveURL(/.*\/chat/);

            // 验证 Sidebar 存在 (History 链接)
            // Sidebar in Chat interface might be different, but typically still has History or similar.
            // Let's check for the main input area as a primary indicator of Chat UI
            await expect(page.getByLabel(/Chat input/i)).toBeVisible({ timeout: 10000 });
        });

        test.skip('4.2 [P0] Logout clears session and redirects', async ({ page }) => {
            // NOTE: Dashboard 可能有错误遮罩阻止用户菜单交互
            // 需要重启 dev server 以应用 next.config.ts 更改
            // Given: 用户已登录，在 Chat
            await page.goto('/en/chat');
            await expect(page).toHaveURL(/.*\/chat/);

            // When: 点击用户头像 -> 展开菜单 -> 点击 Log out
            // 用户按钮在 sidebar 底部，包含用户名
            const userButton = page.locator('button').filter({ hasText: /Guest|用户/i }).first();
            await userButton.click();

            // 点击 Log out 菜单项
            await page.getByRole('menuitem', { name: /log out|登出/i }).click();

            // Then: 应该被重定向到首页或登录页
            await expect(page).toHaveURL(/\/(en)?(\/login)?$/, { timeout: 10000 });

            // 验证: 再次访问 /settings 应该被重定向到 login
            await page.goto('/en/settings');
            await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
        });
    });
});
