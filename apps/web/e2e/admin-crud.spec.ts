import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTestProduct, productRequest } from '../src/test/testData'
import { createKeycloakTestAdmin } from './keycloakAdmin'
import { KeycloakLoginPage } from './keycloakLoginPage'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

async function fillProductForm(
  page: Page,
  product: ReturnType<typeof createTestProduct>,
): Promise<void> {
  await page.getByLabel('Ürün adı').fill(product.name)
  await page.getByLabel('Kategori').fill(product.category)
  await page.getByLabel('Açıklama').fill(product.description)
  await page.getByLabel('Fiyat (TL)').fill(product.price)
  await page.getByLabel('Stok adedi').fill(String(product.stock))
}

async function expectProductRow(
  page: Page,
  product: ReturnType<typeof createTestProduct>,
  isUpdated: boolean,
): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: product.name })
  await expect(row).toContainText(product.category)
  await expect(row).toContainText(product.description)
  await expect(row).toContainText(product.stock.toString())
  await expect(row).toContainText(
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
    }).format(Number(product.price)),
  )
  if (isUpdated) {
    await expect(row.getByText('Güncellendi')).toBeVisible()
  } else {
    await expect(row.getByText('Güncellendi')).toHaveCount(0)
  }
}

test.describe('REQ-003/004/005/006 admin product CRUD regression @keycloak', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and start the local Keycloak realm to run these tests.',
  )

  test('admin creates, updates and deletes products while buyers remain read-only', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    const admin = await createKeycloakTestAdmin(request)
    const keycloakLogin = new KeycloakLoginPage(page)
    const buyerContext = await browser.newContext()
    const buyerPage = await buyerContext.newPage()
    let buyerEmail: string | undefined

    try {
      const adminIdentityResponse = await keycloakLogin.login(admin.email, admin.password)
      expect(adminIdentityResponse.status()).toBe(200)
      expect((await adminIdentityResponse.json()).is_admin).toBe(true)
      await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toBeVisible()
      await expect(page.getByText('Henüz listelenecek ürün yok.')).toBeVisible()

      const initialProduct = createTestProduct()
      const invalidProductPostStatuses: number[] = []
      page.on('response', (response) => {
        if (
          response.url().endsWith('/api/v1/products') &&
          response.request().method() === 'POST'
        ) {
          invalidProductPostStatuses.push(response.status())
        }
      })

      await page.getByRole('button', { name: '+ Ürün ekle' }).click()
      const invalidName = `${initialProduct.name}/invalid`
      await fillProductForm(page, { ...initialProduct, name: invalidName })
      await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Ürün bilgilerini kontrol edip tekrar dene.',
      )
      expect(invalidProductPostStatuses).toEqual([])

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/products') &&
          response.request().method() === 'POST',
      )
      await fillProductForm(page, initialProduct)
      await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
      const createResponse = await createResponsePromise
      expect(createResponse.status()).toBe(201)
      const createdProduct = await createResponse.json()
      await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toBeVisible()
      await expectProductRow(page, initialProduct, false)

      await page.getByRole('button', { name: '+ Ürün ekle' }).click()
      await fillProductForm(page, {
        ...initialProduct,
        name: initialProduct.name.toUpperCase(),
      })
      const duplicateResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/products') &&
          response.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
      const duplicateResponse = await duplicateResponsePromise
      expect(duplicateResponse.status()).toBe(409)
      await expect(page.getByRole('alert')).toHaveText(
        'Bu ürün adı katalogda zaten kullanılıyor.',
      )
      await page.getByRole('button', { name: 'İptal' }).click()

      const updatedProduct = createTestProduct()
      await page.getByRole('button', { name: `Düzenle ${initialProduct.name}` }).click()
      await expect(page.getByLabel('Ürün adı')).toHaveValue(initialProduct.name)
      await expect(page.getByLabel('Kategori')).toHaveValue(initialProduct.category)
      await expect(page.getByLabel('Açıklama')).toHaveValue(initialProduct.description)
      await expect(page.getByLabel('Fiyat (TL)')).toHaveValue(initialProduct.price)
      await expect(page.getByLabel('Stok adedi')).toHaveValue(
        String(initialProduct.stock),
      )

      const invalidProductPutStatuses: number[] = []
      page.on('response', (response) => {
        if (
          response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
          response.request().method() === 'PUT'
        ) {
          invalidProductPutStatuses.push(response.status())
        }
      })
      await fillProductForm(page, {
        ...updatedProduct,
        name: `${updatedProduct.name}/invalid`,
      })
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
      await expect(page.getByRole('alert')).toHaveText(
        'Ürün bilgilerini kontrol edip tekrar dene.',
      )
      expect(invalidProductPutStatuses).toEqual([])

      const updateResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
          response.request().method() === 'PUT',
      )
      await fillProductForm(page, updatedProduct)
      await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
      const updateResponse = await updateResponsePromise
      expect(updateResponse.status()).toBe(200)
      await expectProductRow(page, updatedProduct, true)

      const buyerCredentials = createTestProduct()
      buyerEmail = `buyer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`
      await buyerPage.goto('/')
      await buyerPage.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
      await expect(buyerPage).toHaveURL(/localhost:8080/)
      await buyerPage.getByRole('link', { name: 'Register' }).click()
      const registrationForm = buyerPage.locator('#kc-register-form')
      await expect(registrationForm).toBeVisible()
      await buyerPage.locator('#firstName').fill('Test')
      await buyerPage.locator('#lastName').fill('Buyer')
      await buyerPage.locator('#email').fill(buyerEmail)
      const usernameField = buyerPage.locator('#username')
      if (await usernameField.count() > 0) {
        await usernameField.fill(buyerEmail)
      }
      const buyerPassword = `LivaE2E-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}!Aa`
      await buyerPage.locator('#password').fill(buyerPassword)
      await buyerPage.locator('#password-confirm').fill(buyerPassword)
      const buyerIdentityPromise = buyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/auth/me') &&
          response.request().method() === 'GET',
      )
      await registrationForm.locator('input[type="submit"]').click()
      const buyerIdentityResponse = await buyerIdentityPromise
      expect(buyerIdentityResponse.status()).toBe(200)
      const buyerIdentity = await buyerIdentityResponse.json()
      expect(buyerIdentity.roles).toContain('buyer')
      expect(buyerIdentity.is_admin).toBe(false)
      await expectProductRow(buyerPage, updatedProduct, true)
      await expect(
        buyerPage.getByRole('button', { name: '+ Ürün ekle' }),
      ).toHaveCount(0)
      await expect(
        buyerPage.getByRole('button', { name: `Düzenle ${updatedProduct.name}` }),
      ).toHaveCount(0)
      await expect(
        buyerPage.getByRole('button', { name: `Sil ${updatedProduct.name}` }),
      ).toHaveCount(0)

      const buyerToken = buyerIdentityResponse.request().headers().authorization
      expect(buyerToken).toMatch(/^Bearer /)
      const deniedCreate = await request.post(
        'http://127.0.0.1:8001/api/v1/products',
        {
          data: productRequest(buyerCredentials),
          headers: { authorization: buyerToken },
        },
      )
      const deniedUpdate = await request.put(
        `http://127.0.0.1:8001/api/v1/products/${createdProduct.id}`,
        {
          data: productRequest(buyerCredentials),
          headers: { authorization: buyerToken },
        },
      )
      const deniedDelete = await request.delete(
        `http://127.0.0.1:8001/api/v1/products/${createdProduct.id}`,
        { headers: { authorization: buyerToken } },
      )
      expect(deniedCreate.status()).toBe(403)
      expect(deniedUpdate.status()).toBe(403)
      expect(deniedDelete.status()).toBe(403)

      const adminToken = adminIdentityResponse.request().headers().authorization
      const preservedProductResponse = await request.get(
        'http://127.0.0.1:8001/api/v1/products',
        { headers: { authorization: adminToken } },
      )
      expect(preservedProductResponse.status()).toBe(200)
      const preservedProducts = (await preservedProductResponse.json()).products
      const preservedProduct = preservedProducts.find(
        (product: { id: number }) => product.id === createdProduct.id,
      )
      expect(preservedProduct).toMatchObject({
        ...productRequest(updatedProduct),
      })

      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain(updatedProduct.name)
        await dialog.accept()
      })
      const deleteResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
          response.request().method() === 'DELETE',
      )
      await page.getByRole('button', { name: `Sil ${updatedProduct.name}` }).click()
      const deleteResponse = await deleteResponsePromise
      expect(deleteResponse.status()).toBe(204)
      await expect(
        page.getByRole('row').filter({ hasText: updatedProduct.name }),
      ).toHaveCount(0)
      const finalProductResponse = await request.get(
        'http://127.0.0.1:8001/api/v1/products',
        { headers: { authorization: adminToken } },
      )
      expect(finalProductResponse.status()).toBe(200)
      const finalProducts = (await finalProductResponse.json()).products
      expect(finalProducts.some((product: { id: number }) => product.id === createdProduct.id))
        .toBe(false)
    } finally {
      try {
        await buyerContext.close()
      } finally {
        try {
          if (buyerEmail) {
            await admin.deleteUserByEmail(buyerEmail)
          }
        } finally {
          await admin.cleanup()
        }
      }
    }
  })
})
