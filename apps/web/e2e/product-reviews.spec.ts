import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test.describe('REQ-022 buyer product reviews @smoke', () => {
  test.skip(process.env.E2E_KEYCLOAK_E2E === '1', 'Uses the isolated test identity provider.')

  test('reviews a delivered product, edits and removes the persisted review', async ({ page, request, scenario }) => {
    const product = await scenario.api.createProduct({
      name: `REQ-022 ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Review journey product.',
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
    const adminReview = await request.put(
      `http://127.0.0.1:8001/api/v1/products/${product.id}/reviews/me`,
      { headers: scenario.api.headers('admin'), data: { rating: 5, comment: 'Yetkisiz değerlendirme.' } },
    )
    expect(adminReview.status()).toBe(403)
    await scenario.authenticate(page, 'buyer')
    await page.goto(`/products/${product.id}`)
    await page.getByRole('button', { name: 'Değerlendirmeleri göster' }).click()
    await expect(page.getByText(/ürünü alıcı olarak teslim/)).toBeVisible()
    await expect(page.getByLabel('Yorum')).toHaveCount(0)
    const payment = await request.post(`http://127.0.0.1:8001/api/v1/orders/${order.id}/payments`, {
      headers: { ...scenario.api.headers('buyer'), 'Idempotency-Key': `${scenario.id}-payment` },
    })
    expect(payment.status()).toBe(201)
    const paymentBody = await payment.json() as { checkout_url: string }
    const paid = await request.post(`http://127.0.0.1:8001${paymentBody.checkout_url}`, {
      data: { status: 'succeeded' },
    })
    expect(paid.status()).toBe(200)
    for (const status of ['processing', 'shipped', 'delivered']) {
      const response = await request.patch(`http://127.0.0.1:8001/api/v1/admin/orders/${order.id}/status`, {
        headers: scenario.api.headers('admin'), data: { status },
      })
      expect(response.status()).toBe(200)
    }

    await page.reload()
    await page.getByRole('button', { name: 'Değerlendirmeleri göster' }).click()
    await expect(page.getByLabel('Yorum')).toBeVisible()
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations).toEqual([])
    await page.getByLabel('Puan').selectOption('4')
    await page.getByLabel('Yorum').fill('Ürün beklediğim gibi geldi.')
    await page.getByRole('button', { name: 'Değerlendirmeyi kaydet' }).click()
    await expect(page.getByText('Değerlendirmen kaydedildi.')).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Değerlendirmeleri göster' }).click()
    await expect(page.getByLabel('Yorum')).toHaveValue('Ürün beklediğim gibi geldi.')
    await page.getByLabel('Puan').selectOption('5')
    await page.getByLabel('Yorum').fill('Ürün çok daha güzel çıktı.')
    await page.getByRole('button', { name: 'Değerlendirmeyi kaydet' }).click()
    await expect(page.getByRole('list', { name: 'Değerlendirme listesi' })).toContainText('5/5')
    await expect(page.getByRole('list', { name: 'Değerlendirme listesi' })).toContainText('Ürün çok daha güzel çıktı.')
    await page.getByRole('button', { name: 'Değerlendirmemi sil' }).click()
    await expect(page.getByText('Değerlendirmen silindi.')).toBeVisible()
    await expect(page.getByText('Henüz değerlendirme yok.')).toBeVisible()
  })
})
