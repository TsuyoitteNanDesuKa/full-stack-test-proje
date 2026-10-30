import { expect, test } from '@playwright/test'
import {
  testAdminEmail,
  testAdminPassword,
  testEmail,
  testPassword,
} from './test-credentials'
import { createTestProduct, productRequest } from '../src/test/testData'

test.describe('REQ-001 login, REQ-002 catalog, REQ-003 creation, REQ-004 editing, and REQ-005 deletion', () => {
  test('admin logs in and adds a product from the product page', async ({ page }) => {
    const newProduct = createTestProduct()
    const changedProduct = createTestProduct()
    await page.goto('/')
    await page.getByLabel('E-posta adresi').fill(testAdminEmail)
    await page.getByLabel('Parola', { exact: true }).fill(testAdminPassword)

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/login') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /giriş yap/i }).click()
    const loginResponse = await loginResponsePromise
    expect(loginResponse.status()).toBe(200)
    expect((await loginResponse.json()).is_admin).toBe(true)

    await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toBeVisible()
    await page.getByRole('button', { name: '+ Ürün ekle' }).click()
    await expect(page.getByRole('heading', { name: 'Yeni ürün ekle' })).toBeVisible()
    await page.getByLabel('Ürün adı').fill('Admin!')
    await page.getByLabel('Kategori').fill('Test Kategorisi')
    await page.getByLabel('Açıklama').fill('Admin sayfasından eklenen test ürünü.')
    await page.getByLabel('Fiyat (TL)').fill('89.90')
    await page.getByLabel('Stok adedi').fill('6')

    let createRequestCount = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/products') && request.method() === 'POST') {
        createRequestCount += 1
      }
    })
    await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'Ürün bilgilerini kontrol edip tekrar dene.',
    )
    expect(createRequestCount).toBe(0)

    await page.getByLabel('Ürün adı').fill(newProduct.name)
    await page.getByLabel('Kategori').fill(newProduct.category)
    await page.getByLabel('Açıklama').fill(newProduct.description)
    await page.getByLabel('Fiyat (TL)').fill(newProduct.price)
    await page.getByLabel('Stok adedi').fill(String(newProduct.stock))
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/products') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
    const createResponse = await createResponsePromise

    expect(createResponse.status()).toBe(201)
    const createdProduct = await createResponse.json()
    await expect(page.getByRole('table', { name: 'Ürün listesi' })).toContainText(
      newProduct.name,
    )
    await page.getByRole('button', { name: `Düzenle ${newProduct.name}` }).click()
    await expect(page.getByRole('heading', { name: 'Ürünü düzenle' })).toBeVisible()
    await expect(page.getByLabel('Ürün adı')).toHaveValue(newProduct.name)
    await expect(page.getByLabel('Kategori')).toHaveValue(newProduct.category)
    await expect(page.getByLabel('Açıklama')).toHaveValue(newProduct.description)
    await expect(page.getByLabel('Fiyat (TL)')).toHaveValue(newProduct.price)
    await expect(page.getByLabel('Stok adedi')).toHaveValue(String(newProduct.stock))
    let updateRequestCount = 0
    page.on('request', (request) => {
      if (
        request.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
        request.method() === 'PUT'
      ) {
        updateRequestCount += 1
      }
    })
    await page.getByLabel('Ürün adı').fill('Invalid!')
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'Ürün bilgilerini kontrol edip tekrar dene.',
    )
    expect(updateRequestCount).toBe(0)

    await page.getByLabel('Ürün adı').fill(changedProduct.name)
    await page.getByLabel('Kategori').fill(changedProduct.category)
    await page.getByLabel('Açıklama').fill(changedProduct.description)
    await page.getByLabel('Fiyat (TL)').fill(changedProduct.price)
    await page.getByLabel('Stok adedi').fill(String(changedProduct.stock))
    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
        response.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
    const updateResponse = await updateResponsePromise

    expect(updateResponse.status()).toBe(200)
    const updatedProduct = await updateResponse.json()
    expect(updatedProduct).toMatchObject({
      ...productRequest(changedProduct),
    })
    expect(updatedProduct.updated_at).toBeTruthy()
    const updatedRow = page.getByRole('row', { name: new RegExp(changedProduct.name) })
    await expect(updatedRow).toContainText('Güncellendi')
    await expect(updatedRow).toContainText(
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(Number(changedProduct.price)),
    )
    await expect(updatedRow).toContainText(String(changedProduct.stock))

    await page.getByRole('button', { name: '+ Ürün ekle' }).click()
    await page.getByLabel('Ürün adı').fill(changedProduct.name.toLowerCase())
    await page.getByLabel('Kategori').fill(newProduct.category)
    await page.getByLabel('Açıklama').fill(newProduct.description)
    await page.getByLabel('Fiyat (TL)').fill(newProduct.price)
    await page.getByLabel('Stok adedi').fill(String(newProduct.stock))
    const duplicateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/products') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
    const duplicateResponse = await duplicateResponsePromise

    expect(duplicateResponse.status()).toBe(409)
    await expect(page.getByRole('alert')).toContainText(
      'Bu ürün adı katalogda zaten kullanılıyor.',
    )

    await page.getByRole('button', { name: 'Ürün listesine dön' }).click()
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
        response.request().method() === 'DELETE',
    )
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain(changedProduct.name)
      void dialog.accept()
    })
    await page.getByRole('button', { name: `Sil ${changedProduct.name}` }).click()
    const deleteResponse = await deleteResponsePromise

    expect(deleteResponse.status()).toBe(204)
    await expect(
      page.getByRole('row', { name: new RegExp(changedProduct.name) }),
    ).toHaveCount(0)
    await expect(page.getByRole('table', { name: 'Ürün listesi' })).not.toContainText(
      changedProduct.name,
    )
  })

  test('logs into the real API and lists products created through the API', async ({
    page,
    request,
  }) => {
    const apiBase = 'http://127.0.0.1:8001/api/v1'
    const apiProduct = createTestProduct()
    const apiUpdatedProduct = createTestProduct()
    const unauthorizedProduct = createTestProduct()
    const adminLogin = await request.post(`${apiBase}/auth/login`, {
      data: { email: testAdminEmail, password: testAdminPassword },
    })
    expect(adminLogin.status()).toBe(200)
    const loginData: { access_token: string } = await adminLogin.json()
    const token = loginData.access_token
    const createProduct = await request.post(`${apiBase}/products`, {
      data: productRequest(apiProduct),
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(createProduct.status()).toBe(201)
    const createdProduct = await createProduct.json()
    const updateResponse = await request.put(
      `${apiBase}/products/${createdProduct.id}`,
      {
        data: productRequest(apiUpdatedProduct),
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    expect(updateResponse.status()).toBe(200)

    const customerLogin = await request.post(`${apiBase}/auth/login`, {
      data: { email: testEmail, password: testPassword },
    })
    expect(customerLogin.status()).toBe(200)
    const customerLoginData: { access_token: string } = await customerLogin.json()
    const customerProductDelete = await request.delete(
      `${apiBase}/products/${createdProduct.id}`,
      {
        headers: { Authorization: `Bearer ${customerLoginData.access_token}` },
      },
    )
    expect(customerProductDelete.status()).toBe(403)
    const customerProductWrite = await request.post(`${apiBase}/products`, {
      data: productRequest(unauthorizedProduct),
      headers: { Authorization: `Bearer ${customerLoginData.access_token}` },
    })
    expect(customerProductWrite.status()).toBe(403)

    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Merhaba.' })).toBeVisible()
    await page.getByLabel('E-posta adresi').fill(testEmail)
    await page.getByLabel('Parola', { exact: true }).fill(testPassword)

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/login') &&
        response.request().method() === 'POST',
    )
    const homeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/home') &&
        response.request().method() === 'GET',
    )
    const productsResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/products?') &&
        response.request().method() === 'GET',
    )
    await page.getByRole('button', { name: /giriş yap/i }).click()
    const loginResponse = await loginResponsePromise

    expect(loginResponse.status()).toBe(200)
    const homeResponse = await homeResponsePromise
    expect(homeResponse.status()).toBe(200)
    const productsResponse = await productsResponsePromise
    expect(productsResponse.status()).toBe(200)
    expect((await productsResponse.json()).total).toBeGreaterThanOrEqual(1)

    await expect(
      page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'İşlem' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Sil / })).toHaveCount(0)
    await expect(page.getByRole('table', { name: 'Ürün listesi' })).toContainText(
      apiUpdatedProduct.name,
    )
    const updatedRow = page.getByRole('row', { name: new RegExp(apiUpdatedProduct.name) })
    await expect(updatedRow).toContainText('Güncellendi')
    await expect(updatedRow).toContainText(apiUpdatedProduct.description)
    await expect(updatedRow).toContainText(
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(Number(apiUpdatedProduct.price)),
    )
    await expect(updatedRow).toContainText(String(apiUpdatedProduct.stock))
    await expect(page.getByText(testEmail, { exact: false })).toBeVisible()
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0)

    await page.getByRole('button', { name: /çıkış yap/i }).click()
    await expect(page.getByRole('heading', { name: 'Merhaba.' })).toBeVisible()
  })

  test('shows a generic error for invalid credentials without calling protected APIs', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByLabel('E-posta adresi').fill(testEmail)
    await page.getByLabel('Parola', { exact: true }).fill('incorrect-password')
    let homeRequestCount = 0
    page.on('request', (request) => {
      if (
        request.url().endsWith('/api/v1/home') ||
        request.url().includes('/api/v1/products')
      ) {
        homeRequestCount += 1
      }
    })
    await page.getByRole('button', { name: /giriş yap/i }).click()

    await expect(page.getByRole('alert')).toContainText(
      'E-posta adresi veya parola hatalı. Bilgilerini kontrol edip tekrar dene.',
    )
    await expect(page.getByRole('heading', { name: 'Merhaba.' })).toBeVisible()
    expect(homeRequestCount).toBe(0)
  })
})
