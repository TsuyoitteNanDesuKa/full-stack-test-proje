import { createPublicKey, verify } from 'node:crypto'
import { expect, test } from './fixtures'

test.describe('QA-019 deterministic buyer checkout @smoke', () => {
  test.skip(
    process.env.E2E_KEYCLOAK_E2E === '1',
    'This scenario uses the isolated Playwright test identity provider.',
  )

  test('buyer checks out a product and completes the mock payment', async ({
    page,
    request,
    scenario,
  }) => {
    const jwksResponse = await request.get(
      'http://127.0.0.1:8082/realms/e2e/protocol/openid-connect/certs',
    )
    expect(jwksResponse.status()).toBe(200)
    const jwks = (await jwksResponse.json()) as {
      keys: Array<JsonWebKey & { kid?: string; alg?: string }>
    }
    expect(jwks.keys).toEqual([
      expect.objectContaining({ kid: 'liva-playwright-e2e', alg: 'RS256' }),
    ])

    const product = {
      name: `QA-019 ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Product for the deterministic CI checkout scenario.',
      price: '25.00',
      stock: 5,
    }
    const adminToken = scenario.api.token('admin')
    const [header, payload, signature] = adminToken.split('.')
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        createPublicKey({ key: jwks.keys[0], format: 'jwk' }),
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true)
    const identityResponse = await request.get('http://127.0.0.1:8001/api/v1/auth/me', {
      headers: scenario.api.headers('admin'),
    })
    const identityBody = (await identityResponse.json()) as { roles: string[] }
    expect(identityResponse.status(), JSON.stringify(identityBody)).toBe(200)
    expect(identityBody.roles).toContain('admin')

    await scenario.api.createProduct(product)

    await scenario.authenticate(page, 'buyer')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }))
      .toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: product.name })).toBeVisible()

    const forbiddenProductCreate = await page.request.post(
      'http://127.0.0.1:8001/api/v1/products',
      {
        data: { ...product, name: 'QA-019 Forbidden Product' },
        headers: scenario.api.headers('buyer'),
      },
    )
    expect(forbiddenProductCreate.status()).toBe(403)

    await page.getByRole('button', { name: `Sepete ekle ${product.name}` }).click()
    await page.getByRole('button', { name: 'Adreslerim', exact: true }).click()
    await page.getByLabel('Adres başlığı').fill('QA-019 Home')
    await page.getByLabel('Alıcı adı').fill('QA-019 Buyer')
    await page.getByLabel('Telefon').fill('+905551234567')
    await page.getByLabel('İl', { exact: true }).fill('Istanbul')
    await page.getByLabel('İlçe', { exact: true }).fill('Kadikoy')
    await page.getByLabel('Açık adres').fill('Deterministic Test Street 1')
    await page.getByLabel('Posta kodu (isteğe bağlı)').fill('34710')
    await page.getByLabel('Varsayılan teslimat adresim yap').check()
    await page.getByRole('button', { name: 'Adresi kaydet' }).click()

    const cartToggle = page.getByRole('button', { name: /^Sepet \(\d+\)$/ })
    if ((await cartToggle.getAttribute('aria-expanded')) !== 'true') {
      await cartToggle.click()
    }
    await expect(page.getByRole('combobox', { name: 'Teslimat adresi' }))
      .toHaveValue(/\d+/)
    await page.getByRole('button', { name: 'Adres defterini kapat' }).click()
    const checkoutResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/orders') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Siparişi oluştur' }).click()
    const orderResponse = await checkoutResponse
    expect(orderResponse.status()).toBe(201)
    const order = (await orderResponse.json()) as {
      id: number
      total_amount: string
    }
    expect(order.total_amount).toBe('74.90')
    await expect(page.getByText('Ödeme adımı bekleniyor.')).toBeVisible()

    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    await page.getByRole('button', { name: 'Ödemeye devam et' }).click()
    await page.getByRole('link', { name: 'Güvenli test ödeme sayfasına git' }).click()
    await expect(page.getByRole('heading', { name: 'Test ödeme sayfası' }))
      .toBeVisible()
    await page.getByRole('button', { name: 'Test ödemesini başarılı yap' }).click()
    await expect(page.getByRole('status')).toHaveText('Ödeme durumu: succeeded')

    await page.goto('/')
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    const orderRow = page.locator('.order-history-item').filter({
      hasText: `Sipariş #${order.id}`,
    })
    await expect(orderRow.locator('.order-history-summary').first()).toContainText('Ödendi')
    await expect(page.getByText('Ödeme alındı')).toBeVisible()
  })
})
