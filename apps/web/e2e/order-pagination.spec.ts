import { expect, test } from './fixtures'

test.describe('buyer order pagination @smoke', () => {
  test.skip(process.env.E2E_KEYCLOAK_E2E === '1', 'Uses the deterministic test identity.')

  test('navigates order pages and performs payment, cancellation and return', async ({
    page,
    request,
    scenario,
  }) => {
    test.setTimeout(90_000)
    const product = await scenario.api.createProduct({
      name: `Page ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Order pagination scenario product.',
      price: '25.00',
      stock: 30,
    })
    const address = await scenario.api.createAddress({
      label: 'Ev', recipient_name: 'Test Buyer', phone: '+905551234567',
      city: 'Istanbul', district: 'Kadikoy', address_line: 'Test street 1',
      postal_code: '34710', is_default: true,
    })
    const orders: Array<{ id: number }> = []
    for (let index = 0; index < 23; index += 1) {
      await scenario.api.addCartItem(product.id)
      orders.push(await scenario.api.createOrder(address.id, `${scenario.id}-order-${index}`))
    }

    const returnOrder = orders[0]
    const cancelOrder = orders[1]
    const paymentOrder = orders[2]
    const payment = await request.post(`http://127.0.0.1:8001/api/v1/orders/${returnOrder.id}/payments`, {
      headers: { ...scenario.api.headers('buyer'), 'Idempotency-Key': `${scenario.id}-return-payment` },
    })
    expect(payment.status()).toBe(201)
    const paymentBody = await payment.json() as { checkout_url: string }
    const paid = await request.post(`http://127.0.0.1:8001${paymentBody.checkout_url}`, {
      data: { status: 'succeeded' },
    })
    expect(paid.status()).toBe(200)
    for (const status of ['processing', 'shipped', 'delivered']) {
      const response = await request.patch(
        `http://127.0.0.1:8001/api/v1/admin/orders/${returnOrder.id}/status`,
        { headers: scenario.api.headers('admin'), data: { status } },
      )
      expect(response.status()).toBe(200)
    }

    await scenario.authenticate(page, 'buyer')
    await page.goto('/')
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    const navigation = page.getByRole('navigation', { name: 'Sipariş geçmişi sayfaları' })
    await expect(navigation).toHaveCount(1)
    await expect(page.locator('.order-history-item')).toHaveCount(20)
    await expect(page.getByRole('heading', { name: `Sipariş #${orders[22].id}`, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: `Sipariş #${returnOrder.id}`, exact: true })).toHaveCount(0)
    await expect(navigation.getByRole('button', { name: 'Önceki sayfa' })).toBeDisabled()
    await navigation.getByRole('button', { name: 'Sonraki sayfa' }).click()
    await expect(page.locator('.order-history-item')).toHaveCount(3)
    await expect(navigation.getByText('Sayfa 2')).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Sonraki sayfa' })).toBeDisabled()

    const paymentCard = page.locator('.order-history-item').filter({
      has: page.getByRole('heading', { name: `Sipariş #${paymentOrder.id}`, exact: true }),
    })
    await paymentCard.getByRole('button', { name: 'Ödemeye devam et' }).click()
    await paymentCard.getByRole('link', { name: 'Güvenli test ödeme sayfasına git' }).click()
    await page.getByRole('button', { name: 'Test ödemesini başarılı yap' }).click()
    await expect(page.getByRole('status')).toHaveText('Ödeme durumu: succeeded')
    await page.goto('/')
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    await navigation.getByRole('button', { name: 'Sonraki sayfa' }).click()
    await expect(paymentCard.locator('.order-history-summary').first()).toContainText('Ödendi')

    const cancelCard = page.locator('.order-history-item').filter({
      has: page.getByRole('heading', { name: `Sipariş #${cancelOrder.id}`, exact: true }),
    })
    await cancelCard.getByRole('button', { name: 'Siparişi iptal et' }).click()
    await cancelCard.getByLabel('İptal nedeni (isteğe bağlı)').fill('Vazgeçtim')
    await cancelCard.getByRole('button', { name: 'Sipariş iptalini onayla' }).click()
    await expect(cancelCard.getByText('Sipariş talebinle iptal edildi')).toBeVisible()

    const returnCard = page.locator('.order-history-item').filter({
      has: page.getByRole('heading', { name: `Sipariş #${returnOrder.id}`, exact: true }),
    })
    await returnCard.getByRole('button', { name: `İade et ${product.name}` }).click()
    await returnCard.getByLabel('İade nedeni').fill('Ürün beklediğim gibi değil')
    await returnCard.getByRole('button', { name: 'İade talebini gönder' }).click()
    await expect(returnCard.getByText(/İade talebin otomatik onaylandı/)).toBeVisible()

    await navigation.getByRole('button', { name: 'Önceki sayfa' }).click()
    await expect(page.locator('.order-history-item')).toHaveCount(20)
    await navigation.getByRole('button', { name: 'Sonraki sayfa' }).click()
    await expect(cancelCard.getByText('Sipariş talebinle iptal edildi')).toBeVisible()
    await expect(returnCard.getByRole('list', { name: `Sipariş ${returnOrder.id} iadeleri` }))
      .toContainText('Otomatik onaylandı')
    await expect(paymentCard.locator('.order-history-summary').first()).toContainText('Ödendi')
    await page.getByRole('button', { name: 'Yenile', exact: true }).click()
    await expect(page.locator('.order-history-item')).toHaveCount(20)
    await expect(navigation.getByText('Sayfa 1')).toBeVisible()
  })
})
