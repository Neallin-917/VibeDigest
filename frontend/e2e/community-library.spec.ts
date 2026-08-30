import { expect, test } from '@playwright/test'

const firstDigestTitle = 'From Prediction to Simulation: Teaching AI to Shape the Future'
const libraryUrl = process.env.COMMUNITY_LIBRARY_E2E_BASE_URL
  ? new URL('/zh/explore', process.env.COMMUNITY_LIBRARY_E2E_BASE_URL).toString()
  : '/zh/explore'

test.describe('Community library cards', () => {
  test('stays compact and overflow-free across target viewports', async ({ page }) => {
    await page.goto(libraryUrl)
    await expect(page.getByRole('heading', { level: 1, name: '已经整理好的播客' })).toBeVisible()

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1024, height: 900 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport)
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

      const metrics = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('[data-card-role]')
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          firstCardHeight: card?.getBoundingClientRect().height ?? 0,
        }
      })

      expect(metrics.scrollWidth).toBe(metrics.innerWidth)
      if (viewport.width === 390) {
        expect(metrics.firstCardHeight).toBeLessThan(470)
      }
    }
  })

  test('offers one digest stop followed by one clearly named source stop', async ({ page }) => {
    await page.goto(libraryUrl)

    const card = page.locator('[data-card-role]').first()
    const digest = card.getByRole('link', { name: `查看整理: ${firstDigestTitle}` })
    const source = card.getByRole('link', { name: `原节目: ${firstDigestTitle}` })

    await expect(card.getByRole('link')).toHaveCount(2)
    await expect(digest).toHaveAttribute('href', /\/zh\/tasks\/local-demo-latent-space\//)
    await expect(source).toHaveAttribute('target', '_blank')

    await digest.focus()
    await expect(digest).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(source).toBeFocused()
  })

  test('reduces card motion when the user requests it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(libraryUrl)

    const image = page.locator('[data-card-role] img').first()
    const motion = await image.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        animationName: style.animationName,
        transitionDuration: Number.parseFloat(style.transitionDuration),
      }
    })

    expect(motion.animationName).toBe('none')
    expect(motion.transitionDuration).toBeLessThan(0.001)
  })
})
