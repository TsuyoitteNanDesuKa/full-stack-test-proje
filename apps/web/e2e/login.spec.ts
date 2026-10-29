import { expect, test } from '@playwright/test'
import {
  testAdminEmail,
  testAdminPassword,
  testEmail,
  testPassword,
} from './test-credentials'

test.describe('REQ-001 login, REQ-002 catalog, REQ-003 product creation, and REQ-004 editing', () => {
  test('admin logs in and adds a product from the product page', async ({ page }) => {
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

    await page.getByLabel('Ürün adı').fill('Admin UI Test Ürünü')
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
      'Admin UI Test Ürünü',
    )
    await page.getByRole('button', { name: 'Düzenle Admin UI Test Ürünü' }).click()
    await expect(page.getByRole('heading', { name: 'Ürünü düzenle' })).toBeVisible()
    await expect(page.getByLabel('Ürün adı')).toHaveValue('Admin UI Test Ürünü')
    await expect(page.getByLabel('Kategori')).toHaveValue('Test Kategorisi')
    await expect(page.getByLabel('Açıklama')).toHaveValue(
      'Admin sayfasından eklenen test ürünü.',
    )
    await expect(page.getByLabel('Fiyat (TL)')).toHaveValue('89.90')
    await expect(page.getByLabel('Stok adedi')).toHaveValue('6')
    await page.getByLabel('Ürün adı').fill('Admin UI Güncellenmiş Ürün')
    await page.getByLabel('Kategori').fill('Kişisel Bakım')
    await page.getByLabel('Açıklama').fill('Admin tarafından düzenlenen ürün açıklaması.')
    await page.getByLabel('Fiyat (TL)').fill('99.90')
    await page.getByLabel('Stok adedi').fill('12')
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
      name: 'Admin UI Güncellenmiş Ürün',
      category: 'Kişisel Bakım',
      description: 'Admin tarafından düzenlenen ürün açıklaması.',
      price: '99.90',
      stock: 12,
    })
    expect(updatedProduct.updated_at).toBeTruthy()
    const updatedRow = page.getByRole('row', { name: /Admin UI Güncellenmiş Ürün/ })
    await expect(updatedRow).toContainText('Güncellendi')
    await expect(updatedRow).toContainText('₺99,90')
    await expect(updatedRow).toContainText('12')

    await page.getByRole('button', { name: '+ Ürün ekle' }).click()
    await page.getByLabel('Ürün adı').fill('admin ui güncellenmiş ürün')
    await page.getByLabel('Kategori').fill('Test Kategorisi')
    await page.getByLabel('Açıklama').fill('Aynı ürün adı yeniden eklenmemelidir.')
    await page.getByLabel('Fiyat (TL)').fill('89.90')
    await page.getByLabel('Stok adedi').fill('6')
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
  })

  test('logs into the real API and lists products created through the API', async ({
    page,
    request,
  }) => {
    const apiBase = 'http://127.0.0.1:8001/api/v1'
    const adminLogin = await request.post(`${apiBase}/auth/login`, {
      data: { email: testAdminEmail, password: testAdminPassword },
    })
    expect(adminLogin.status()).toBe(200)
    const loginData: { access_token: string } = await adminLogin.json()
    const token = loginData.access_token
    const createProduct = await request.post(`${apiBase}/products`, {
      data: {
        name: 'E2E Lavanta El Kremi',
        category: 'Kişisel Bakım',
        description: 'API üzerinden oluşturulan test ürünü.',
        price: '129.90',
        stock: 24,
      },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(createProduct.status()).toBe(201)
    const createdProduct = await createProduct.json()
    const updateResponse = await request.put(
      `${apiBase}/products/${createdProduct.id}`,
      {
        data: {
          name: 'E2E Güncellenmiş El Kremi',
          category: 'Kişisel Bakım',
          description: 'Yönetici tarafından güncellenen ürün.',
          price: '149.90',
          stock: 18,
        },
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    expect(updateResponse.status()).toBe(200)

    const customerLogin = await request.post(`${apiBase}/auth/login`, {
      data: { email: testEmail, password: testPassword },
    })
    expect(customerLogin.status()).toBe(200)
    const customerLoginData: { access_token: string } = await customerLogin.json()
    const customerProductWrite = await request.post(`${apiBase}/products`, {
      data: {
        name: 'Yetkisiz Ürün',
        category: 'Test',
        description: 'Müşteri hesabıyla oluşturulmamalı.',
        price: '1.00',
        stock: 1,
      },
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
    await expect(page.getByRole('table', { name: 'Ürün listesi' })).toContainText(
      'E2E Güncellenmiş El Kremi',
    )
    const updatedRow = page.getByRole('row', { name: /E2E Güncellenmiş El Kremi/ })
    await expect(updatedRow).toContainText('Güncellendi')
    await expect(updatedRow).toContainText('Yönetici tarafından güncellenen ürün.')
    await expect(updatedRow).toContainText('₺149,90')
    await expect(updatedRow).toContainText('18')
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
