import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const wcag21AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test.describe('QA-017 accessibility', () => {
  test('unauthenticated entry has no WCAG 2.1 A/AA axe violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(wcag21AA).analyze()
    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        message: node.any.map((check) => check.message).join('; '),
      })),
    }))
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  test('keyboard users can reach entry actions with a visible focus indicator', async ({
    page,
  }) => {
    await page.goto('/')

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Liva ana sayfa' })).toBeFocused()

    await page.keyboard.press('Tab')
    const login = page.getByRole('button', { name: 'Giriş yap' })
    await expect(login).toBeFocused()
    await expect(login).toHaveCSS('outline-style', 'solid')
    await expect(login).toHaveCSS('outline-width', '3px')

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Alıcı hesabı oluştur' })).toBeFocused()
  })
})
