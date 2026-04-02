import { test as setup, expect } from '@playwright/test';
import { AuthPage } from './pages/AuthPage';
import { setupApiMocks } from './fixtures/mock-api';

const authFile = 'playwright/.auth/user.json';

/**
 * Auth Setup - 登录测试账户并保存 Session
 * 
 * 此脚本会在需要认证的测试之前运行，保存登录态到 storageState
 */
setup('authenticate', async ({ page }) => {
    const baseURL = 'http://localhost:3001';
    
    // 0. 预先注入 Auth Bypass Cookie
    await page.context().addCookies([
        {
            name: 'VIBEDIGEST_E2E_AUTH_BYPASS',
            value: 'true',
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
        }
    ]);

    // 1. 直接注入 Session 到 localStorage (绕过 UI 登录)
    // 这是 Supabase E2E 测试中最稳健的做法
    const mockSession = {
        access_token: 'fake-jwt-token',
        refresh_token: 'fake-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
            id: 'test-user-id',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'e2e@vibedigest.io',
            app_metadata: { provider: 'email' },
            user_metadata: { full_name: 'E2E Test User' },
        }
    };

    // 我们需要知道 Supabase 的 Storage Key
    // 默认格式是 sb-[project-ref]-auth-token
    // 由于我们在 .env.local 设为 localhost:54321，这里的 ref 可能不固定
    // 但我们可以通过代码动态注入
    await page.addInitScript((session) => {
        // 覆盖所有可能的 Supabase 存储键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.includes('-auth-token')) localStorage.removeItem(key);
        }
        localStorage.setItem('supabase.auth.token', JSON.stringify(session));
        // 同时注入全局变量供 mock-api 使用
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__SUPABASE_MOCK_SESSION__ = session;
    }, mockSession);

    // 2. 使用统一的 API Mock 处理网络层
    await setupApiMocks(page, { isAuthenticated: true });

    // 3. 直接导航到受保护路由，验证注入是否成功
    await page.goto('/en/chat');
    
    // 4. 等待页面加载并确认没有被重定向回登录页
    await expect(page).toHaveURL(/.*\/chat/, { timeout: 30000 });
    
    // 验证 UI 是否渲染了已登录状态 (通过找到聊天输入框)
    await expect(page.getByLabel(/Chat input/i)).toBeVisible({ timeout: 15000 });

    // 5. 保存状态
    await page.context().storageState({ path: authFile });

    console.log('✅ Authentication successful (Injected), state saved to', authFile);
});
