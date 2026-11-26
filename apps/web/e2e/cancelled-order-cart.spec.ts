import { expect, test } from './fixtures'

test.describe('REQ-023 cancelled order cart @smoke', () => {
  test.skip(process.env.E2E_KEYCLOAK_E2E === '1', 'Uses the deterministic test identity.')

  test('merges available items at current prices and reports unavailable items', async ({
    page, request, scenario,
  }) => {
    const suffix = scenario.id.slice(4, 16)
    const available = {
      name: `Reorder available ${suffix}`,
      category: 'Test',
      description: 'Available reorder product.',
      price: '25.00',
      stock: 5,
    }
    const unavailable = {
      name: `Reorder stock ${suffix}`,
      category: 'Test',
      description: 'Out of stock reorder product.',
      price: '30.00',
      stock: 5,
    }
    const first = await scenario.api.createProduct(available)
    const second = await scenario.api.createProduct(unavailable)
    const deleted = await scenario.api.createProduct({
      name: `Reorder deleted ${suffix}`,
      category: 'Test',
      description: 'Deleted reorder product.',
      price: '35.00',
      stock: 5,
    })
    const address = await scenario.api.createAddress({
      label: 'Ev', recipient_name: 'Test Buyer', phone: '+905551234567',
      city: 'Istanbul', district: 'Kadikoy', address_line: 'Test street 1',
      postal_code: '34710', is_default: true,
    })
    for (const product of [first, second, deleted]) {
      await scenario.api.addCartItem(product.id)
    }
    const order = await scenario.api.createOrder(address.id)
    const base = 'http://127.0.0.1:8001/api/v1'
    const cancelled = await request.post(`${base}/orders/${order.id}/cancel`, {
      headers: scenario.api.headers('buyer'),
      data: { reason: null },
    })
    expect(cancelled.status()).toBe(200)
    const changedPrice = await request.put(`${base}/products/${first.id}`, {
      headers: scenario.api.headers('admin'),
      data: { ...available, price: '40.00' },
    })
    expect(changedPrice.status()).toBe(200)
    const changedStock = await request.put(`${base}/products/${second.id}`, {
      headers: scenario.api.headers('admin'),
      data: { ...unavailable, stock: 0 },
    })
    expect(changedStock.status()).toBe(200)
    const removed = await request.delete(`${base}/products/${deleted.id}`, {
      headers: scenario.api.headers('admin'),
    })
    expect(removed.status()).toBe(204)
    await scenario.api.addCartItem(first.id)

    await scenario.authenticate(page, 'buyer')
    await page.goto('/')
    await page.getByRole('button', { name: 'Siparişlerim' }).click()
    const card = page.locator('.order-history-item').filter({ hasText: `Sipariş #${order.id}` })
    await card.getByRole('button', { name: 'İptal edilenleri sepete ekle' }).click()
    const results = card.getByRole('status', { name: `Sipariş ${order.id} sepete ekleme sonuçları` })
    await expect(results).toContainText(`${available.name}: Sepete eklendi`)
    await expect(results).toContainText(`${unavailable.name}: Mevcut sepet miktarıyla birleştirildiğinde stok yetersiz`)
    await expect(results).toContainText(`${deleted.name}: Ürün artık mevcut değil`)

    const cartResponse = await request.get(`${base}/cart`, { headers: scenario.api.headers('buyer') })
    expect(cartResponse.status()).toBe(200)
    const cart = await cartResponse.json() as {
      items: Array<{ product_id: number; quantity: number; unit_price: string }>
      subtotal: string
    }
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]).toMatchObject({ product_id: first.id, quantity: 2, unit_price: '40.00' })
    expect(cart.subtotal).toBe('80.00')
    await expect(page.getByRole('button', { name: 'Sepet (2)' })).toBeVisible()

    const ordersResponse = await request.get(`${base}/orders/page`, {
      headers: scenario.api.headers('buyer'),
    })
    expect(ordersResponse.status()).toBe(200)
    const orders = await ordersResponse.json() as { items: Array<{ id: number; status: string }> }
    expect(orders.items).toMatchObject([{ id: order.id, status: 'cancelled' }])
    expect(orders.items).toHaveLength(1)
  })
})
