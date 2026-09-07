import { expect, test } from '@playwright/test'
import { setupApiMocks } from './fixtures/mock-api'

const outputDir = '../output/playwright/uiux-fixes-2026-09-07'
test.setTimeout(30_000)

test.beforeEach(async ({ page }) => {
  await setupApiMocks(page, { isAuthenticated: false })
})

test('legal routes remain public and protected routes retain their return destination', async ({ page }) => {
  for (const policy of ['refund', 'terms']) {
    await page.goto(`/zh/policies/${policy}`)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/zh/policies/${policy}$`))
    await expect(page.getByRole('navigation', { name: '菜单' })).toBeVisible()
  }
  await page.goto('/zh/policies/refund')
  await page.screenshot({ path: `${outputDir}/refund-public.jpg`, type: 'jpeg' })
  await page.goto('/zh/settings/pricing?plan=pro#topup')
  await expect(page).toHaveURL(/\/zh\/login\?next=/)
  // HTTP redirects inherit the fragment; client redirects include it in next.
  // Both must preserve the complete destination used by the login form.
  const loginUrl = new URL(page.url())
  const next = loginUrl.searchParams.get('next')!
  const destination = new URL(next, loginUrl.origin)
  if (!destination.hash) destination.hash = loginUrl.hash
  expect(`${destination.pathname}${destination.search}${destination.hash}`)
    .toBe('/zh/settings/pricing?plan=pro#topup')
})

test('Chinese hero keeps whole phrases and gives an inline recoverable URL error', async ({ page }) => {
  await page.goto('/zh')
  const heading = page.locator('#hero h1')
  for (const width of [360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(heading).toBeVisible()
    expect(await heading.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return [...element.querySelectorAll('span')].every((span) => {
        const rect = span.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right + 1 && rect.height < 65
      })
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${outputDir}/hero-zh-390.jpg`, type: 'jpeg' })
  const input = page.getByRole('textbox', { name: '视频或播客链接' })
  await input.fill('https://example.com/video')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('#hero [role="alert"]')).toBeVisible()
  await expect(input).toHaveValue('https://example.com/video')
  await page.screenshot({ path: `${outputDir}/url-error-inline.jpg`, type: 'jpeg' })
  await input.fill('https://www.youtube.com/watch?v=local-preview')
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page).toHaveURL(/\/zh\/login\?next=/)
  expect(new URL(page.url()).searchParams.get('next')).toBe('/zh/chat')
  await page.screenshot({ path: `${outputDir}/login-handoff-zh-390.jpg`, type: 'jpeg' })
})

test('library puts the first digest in view and returns to the originating card', async ({ page }) => {
  await page.goto('/en/explore')
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.locator('[data-card-role]').first()).toBeVisible()
    const metrics = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      cardTop: document.querySelector('article')!.getBoundingClientRect().top,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width)
    expect(metrics.cardTop).toBeLessThan(480)
  }
  await page.goto('/en/explore?show=latent-space&q=Prediction&page=2')
  const card = page.locator('[data-card-role]').first()
  await expect(card).toBeVisible()
  const cardId = await card.getAttribute('id')
  await card.getByRole('link', { name: /^View digest:/ }).click()
  const back = page.getByRole('link', { name: 'Back to podcast library' })
  await expect(back).toHaveAttribute('href', `/en/explore?show=latent-space&q=Prediction&page=2#${cardId}`)
  await back.click()
  await expect(page).toHaveURL(new RegExp(`#${cardId}$`))
  await expect(page.getByRole('searchbox')).toHaveValue('Prediction')
  expect((await card.boundingBox())!.y).toBeLessThan(150)
})

test('language change retains the source handoff', async ({ page }) => {
  await page.goto('/en/login?next=%2Fen%2Fchat%3Ftask%3Dsource-1%23answer')
  const language = page.getByRole('combobox', { name: 'Language' })
  await language.focus()
  await language.press('Enter')
  await expect(page.getByRole('listbox', { name: 'Language' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(language).toBeFocused()
  await language.press('Enter')
  await expect(page.getByRole('option', { name: 'English', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Chinese', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/zh\/login/)
  expect(new URL(page.url()).searchParams.get('next')).toBe('/zh/chat?task=source-1#answer')
})

test('pricing has a desktop account menu and keyboard-operable billing choices', async ({ page, context }) => {
  const user = { id: 'test-user-id', aud: 'authenticated', role: 'authenticated', email: 'e2e@vibedigest.io' }
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321')
  const key = `sb-${supabaseUrl.hostname.split('.')[0]}-auth-token`
  const session = { access_token: 'fake-jwt-token', refresh_token: 'fake-refresh-token', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }
  await context.addCookies([{ name: key, value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: 'localhost', path: '/' }])
  await context.addCookies([{ name: 'VIBEDIGEST_E2E_AUTH_BYPASS', value: 'true', domain: 'localhost', path: '/' }])
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 200, json: user }))
  await page.route('**/rest/v1/profiles*', route => route.fulfill({ status: 200, json: { tier: 'free', usage_count: 1, usage_limit: 3, extra_credits: 0 } }))
  await page.route('**/api/threads', route => route.fulfill({ status: 200, json: [] }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/en/settings/pricing')
  const annual = page.getByRole('radio', { name: 'Annual', exact: true })
  const monthly = page.getByRole('radio', { name: 'Monthly', exact: true })
  await expect(annual).toBeChecked()
  await expect(page.getByRole('group', { name: 'Billing period' })).toBeVisible()
  await annual.focus()
  await annual.press('ArrowLeft')
  await expect(monthly).toBeChecked()
  await monthly.press('ArrowRight')
  await expect(annual).toBeChecked()
  await page.getByRole('button', { name: 'Tap your avatar for more options', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Log out', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `${outputDir}/pricing-en-1440.jpg`, type: 'jpeg' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#pro').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `${outputDir}/pricing-en-390.jpg`, type: 'jpeg' })
})
