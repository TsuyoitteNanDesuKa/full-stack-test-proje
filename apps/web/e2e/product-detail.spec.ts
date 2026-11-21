import { expect, test } from './fixtures'

test.describe('REQ-020 product detail page @smoke', () => {
  test.skip(
    process.env.E2E_KEYCLOAK_E2E === '1',
    'This scenario uses the isolated Playwright test identity provider.',
  )

  test('buyer opens a product from the catalog and adds it to the cart from its detail page', async ({
    page,
    scenario,
  }) => {
    const product = {
      name: `REQ-020 ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Product for the REQ-020 detail page scenario.',
      price: '33.50',
      stock: 4,
    }
    await scenario.api.createProduct(product)

    await scenario.authenticate(page, 'buyer')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' })).toBeVisible()

    await page.getByRole('link', { name: product.name }).click()

    await expect(page).toHaveURL(/\/products\/\d+$/)
    await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
    await expect(page.getByText(`Stok: ${product.stock}`)).toBeVisible()

    await page.getByRole('button', { name: 'Sepete ekle', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Ürün sepetine eklendi.')
  })

  test('a direct product URL loads the same detail content', async ({ page, scenario }) => {
    const product = {
      name: `REQ-020 direct ${scenario.id.slice(4, 16)}`,
      category: 'Test',
      description: 'Product opened by direct URL.',
      price: '12.00',
      stock: 2,
    }
    const created = await scenario.api.createProduct(product)

    await scenario.authenticate(page, 'buyer')
    await page.goto(`/products/${created.id}`)

    await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: product.name, level: 1 })).toBeVisible()
  })

  test('an unknown product URL shows the not-found message', async ({ page, scenario }) => {
    await scenario.authenticate(page, 'buyer')
    await page.goto('/products/999999')

    await expect(page.getByRole('alert')).toHaveText('Ürün bulunamadı.')
  })
})
