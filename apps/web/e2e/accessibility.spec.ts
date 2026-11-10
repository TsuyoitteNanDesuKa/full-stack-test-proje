import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { authenticateAs, createTestAccessToken } from './deterministicAuth'

const wcag21AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoAccessibilityViolations(page: Page) {
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
}

test.describe('QA-017 accessibility @smoke', () => {
  test('unauthenticated entry has no WCAG 2.1 A/AA axe violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible()

    await expectNoAccessibilityViolations(page)
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

test.describe('QA-023 critical browser accessibility @smoke', () => {
  test('buyer and admin flows meet WCAG 2.1 A/AA and reflow at mobile width', async ({
    page,
    request,
  }, testInfo) => {
    const scenarioId = `qa023-${testInfo.retry}`
    const adminToken = createTestAccessToken('admin', scenarioId)
    const buyerToken = createTestAccessToken('buyer', scenarioId)
    const apiUrl = 'http://127.0.0.1:8001/api/v1'
    const adminHeaders = { authorization: `Bearer ${adminToken}` }
    const buyerHeaders = { authorization: `Bearer ${buyerToken}` }

    const productResponse = await request.post(`${apiUrl}/products`, {
      data: {
        name: `QA-023 Product ${scenarioId}`,
        category: 'Test',
        description: 'Product for browser accessibility checks.',
        price: '25.00',
        stock: 5,
      },
      headers: adminHeaders,
    })
    expect(productResponse.status()).toBe(201)
    const product = await productResponse.json() as { id: number; name: string }

    const addressResponse = await request.post(`${apiUrl}/addresses`, {
      data: {
        label: 'QA-023 Home',
        recipient_name: 'QA-023 Buyer',
        phone: '+905551234567',
        city: 'Istanbul',
        district: 'Kadikoy',
        address_line: 'Accessibility Test Street 1',
        postal_code: '34710',
        is_default: true,
      },
      headers: buyerHeaders,
    })
    expect(addressResponse.status()).toBe(201)
    const address = await addressResponse.json() as { id: number }

    const cartResponse = await request.post(`${apiUrl}/cart/items`, {
      data: { product_id: product.id, quantity: 1 },
      headers: buyerHeaders,
    })
    expect(cartResponse.status()).toBe(200)
    const orderResponse = await request.post(`${apiUrl}/orders`, {
      data: { address_id: address.id, delivery_method: 'standard' },
      headers: { ...buyerHeaders, 'Idempotency-Key': scenarioId },
    })
    expect(orderResponse.status()).toBe(201)

    await authenticateAs(page, 'buyer', scenarioId)
    await page.goto('/')
    await expect(page.getByRole('row').filter({ hasText: product.name })).toBeVisible()
    await expectNoAccessibilityViolations(page)

    await page.getByRole('button', { name: 'Adreslerim', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Adres defterim' })).toBeVisible()
    await expectNoAccessibilityViolations(page)

    const cartToggle = page.getByRole('button', { name: /^Sepet \(\d+\)$/ })
    if (await cartToggle.getAttribute('aria-expanded') !== 'true') await cartToggle.click()
    await expect(page.getByRole('heading', { name: 'Sepetim' })).toBeVisible()
    await expectNoAccessibilityViolations(page)

    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    await expect(page.getByRole('heading', { name: /Sipariş #/ })).toBeVisible()
    await expectNoAccessibilityViolations(page)

    await page.setViewportSize({ width: 320, height: 720 })
    await expectNoAccessibilityViolations(page)
    const buyerOverflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      elements: Array.from(document.querySelectorAll('body *'))
        .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          right: element.getBoundingClientRect().right,
        }))
        .slice(0, 10),
    }))
    expect(
      buyerOverflow.document,
      `Buyer content must reflow without horizontal page overflow: ${JSON.stringify(buyerOverflow)}`,
    ).toBeLessThanOrEqual(buyerOverflow.viewport)

    await authenticateAs(page, 'admin', scenarioId)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Sipariş yönetimi' })).toBeVisible()
    await expectNoAccessibilityViolations(page)
    await page.getByRole('button', { name: 'Satıcı başvurularını yönet' }).click()
    await expect(page.getByRole('heading', { name: 'Satıcı başvuruları' })).toBeVisible()
    await expectNoAccessibilityViolations(page)

    await page.setViewportSize({ width: 320, height: 720 })
    await expectNoAccessibilityViolations(page)
    const adminOverflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      elements: Array.from(document.querySelectorAll('body *'))
        .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          right: element.getBoundingClientRect().right,
        }))
        .slice(0, 10),
    }))
    expect(
      adminOverflow.document,
      `Admin content must reflow without horizontal page overflow: ${JSON.stringify(adminOverflow)}`,
    ).toBeLessThanOrEqual(adminOverflow.viewport)
  })
})
