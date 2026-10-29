import { expect, test } from '@playwright/test'
import {
  testAdminEmail,
  testAdminPassword,
  testEmail,
  testPassword,
} from './test-credentials'

test.describe('REQ-001 customer login and REQ-002 product catalog', () => {
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
      'E2E Lavanta El Kremi',
    )
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
