import { type Page, type Route } from '@playwright/test';

/** 1x1 transparent PNG as base64 */
const TRANSPARENT_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Block external image requests (YouTube thumbnails, etc.) that timeout in test environments.
 * Returns a 1x1 transparent PNG instead.
 *
 * Next.js proxies external images through `/_next/image?url=<encoded-url>`,
 * so we intercept those server-side proxy requests as well as any direct requests.
 */
export async function blockExternalImages(page: Page) {
  const externalImageDomains = /i\.ytimg\.com|img\.youtube\.com|yt3\.ggpht\.com|i\.bilibili\.com/;

  // Intercept Next.js image optimization proxy requests for external domains
  await page.route(/\/_next\/image\?url=.*(?:i\.ytimg\.com|img\.youtube\.com|yt3\.ggpht\.com|i\.bilibili\.com)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_PIXEL,
    });
  });

  // Also intercept any direct requests to external image domains
  await page.route(externalImageDomains, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TRANSPARENT_PIXEL,
    });
  });
}

/**
 * Mocks common backend API responses for E2E stability.
 *
 * @supabase/ssr createBrowserClient stores session in cookies (NOT localStorage),
 * encoded as base64url with prefix "base64-". We inject the cookie directly.
 */
export async function setupApiMocks(page: Page, options: { isAuthenticated?: boolean } = {}) {
    const { isAuthenticated = false } = options;

    // 0. Set VIBEDIGEST_E2E_AUTH_BYPASS cookie to control client-side isAuthenticated state.
    //    ChatPageClient reads this cookie when NEXT_PUBLIC_E2E_MOCK=1 to determine auth state,
    //    allowing per-test control (true = authenticated, missing = guest).
    if (isAuthenticated) {
        await page.context().addCookies([{
            name: 'VIBEDIGEST_E2E_AUTH_BYPASS',
            value: 'true',
            domain: 'localhost',
            path: '/',
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
        }]);
    }

    // 1. Mock Supabase Auth with state awareness (Network Level)
    await page.route('**/auth/v1/**', async (route) => {
        const url = route.request().url();
        
        if (url.includes('/token') || url.includes('/user') || url.includes('/session')) {
            if (isAuthenticated) {
                // Return authenticated user
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        access_token: 'fake-jwt-token',
                        token_type: 'bearer',
                        expires_in: 3600,
                        refresh_token: 'fake-refresh-token',
                        user: {
                            id: 'test-user-id',
                            aud: 'authenticated',
                            role: 'authenticated',
                            email: 'e2e@vibedigest.io'
                        },
                        session: {
                            access_token: 'fake-jwt-token',
                            user: { id: 'test-user-id', email: 'e2e@vibedigest.io' }
                        }
                    })
                });
            } else {
                // Return successful NULL session (Standard Supabase Guest response)
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ 
                        data: { session: null, user: null },
                        error: null,
                        user: null,
                        session: null 
                    })
                });
            }
        } else {
            await route.continue();
        }
    });

    // 2. Mock Chat Threads API
    await page.route('**/api/chat/threads', async (route) => {
        if (route.request().method() === 'GET') {
            if (isAuthenticated) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        {
                            id: 'mock-thread-1',
                            title: 'Mock Thread 1',
                            updated_at: new Date().toISOString()
                        }
                    ])
                });
            } else {
                await route.fulfill({ status: 401, body: JSON.stringify({ error: 'Unauthorized' }) });
            }
        } else {
            await route.continue();
        }
    });

    // 3. Mock Single Thread Messages API
    await page.route('**/api/chat/threads/*/messages', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // 4. Mock Task Discovery (Explore)
    await page.route('**/api/tasks/explore**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // 5. Block external image requests (YouTube thumbnails timeout in test env)
    await blockExternalImages(page);
}
