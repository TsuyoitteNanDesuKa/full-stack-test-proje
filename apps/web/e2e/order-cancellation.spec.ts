import { expect, test } from './fixtures'

test.describe('REQ-018 buyer order cancellation @smoke', () => {
  test.skip(process.env.E2E_KEYCLOAK_E2E === '1', 'Uses the deterministic test identity.')

  test('buyer cancels a paid order and sees the local refund notice', async ({ page, request, scenario }) => {
    const product = await scenario.api.createProduct({
      name: `Cancel ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Cancellation scenario product.',
      price: '25.00',
      stock: 5,
    })
    const address = await scenario.api.createAddress({
      label: 'Ev', recipient_name: 'Test Buyer', phone: '+905551234567',
      city: 'Istanbul', district: 'Kadikoy', address_line: 'Test street 1',
      postal_code: '34710', is_default: true,
    })
    await scenario.api.addCartItem(product.id)
    const order = await scenario.api.createOrder(address.id)
    const payment = await request.post(`http://127.0.0.1:8001/api/v1/orders/${order.id}/payments`, {
      headers: { ...scenario.api.headers('buyer'), 'Idempotency-Key': `${scenario.id}-payment` },
    })
    expect(payment.status()).toBe(201)
    const paymentBody = await payment.json() as { checkout_url: string }
    const paid = await request.post(`http://127.0.0.1:8001${paymentBody.checkout_url}`, {
      data: { status: 'succeeded' },
    })
    expect(paid.status()).toBe(200)
    await scenario.authenticate(page, 'buyer')
    await page.goto('/')
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    const card = page.locator('.order-history-item').filter({ hasText: `Sipariş #${order.id}` })
    await card.getByRole('button', { name: 'Siparişi iptal et' }).click()
    await card.getByLabel('İptal nedeni (isteğe bağlı)').fill('Vazgeçtim')
    const cancelled = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/orders/${order.id}/cancel`) &&
      response.request().method() === 'POST',
    )
    await card.getByRole('button', { name: 'Sipariş iptalini onayla' }).click()
    expect((await cancelled).status()).toBe(200)
    await expect(card.getByText('Sipariş talebinle iptal edildi')).toBeVisible()
    await expect(card.getByText(/Gerçek para transferi yapılmadı/)).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    await expect(page.getByText('Sipariş talebinle iptal edildi')).toBeVisible()
    const products = await request.get('http://127.0.0.1:8001/api/v1/products', {
      headers: scenario.api.headers('buyer'),
    })
    const body = await products.json() as { products: Array<{ id: number; stock: number }> }
    expect(body.products.find((item) => item.id === product.id)?.stock).toBe(5)
  })
})
