import { expect, test } from './fixtures'

test.describe('REQ-021 buyer favorites @smoke', () => {
  test.skip(process.env.E2E_KEYCLOAK_E2E === '1', 'Uses the isolated test identity provider.')

  test('adds a product, persists the favorite and removes it', async ({ page, scenario }) => {
    const product = await scenario.api.createProduct({
      name: `REQ-021 ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Favorite product.',
      price: '33.50',
      stock: 0,
    })
    await scenario.authenticate(page, 'buyer')
    await page.goto(`/products/${product.id}`)
    await page.getByRole('button', { name: 'Favorilere ekle' }).click()
    await expect(page.getByText('Ürün favorilerine eklendi.')).toBeVisible()
    await page.getByRole('button', { name: 'Kataloğa dön' }).click()
    await page.getByRole('button', { name: 'Favorilerim' }).click()
    await expect(page.getByRole('button', { name: product.name, exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Favorilerim' }).click()
    await expect(page.getByRole('button', { name: product.name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: `${product.name} favorilerden çıkar` }).click()
    await expect(page.getByText('Henüz favori ürünün yok.')).toBeVisible()
  })
})
