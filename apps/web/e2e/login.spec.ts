import { expect, test } from '@playwright/test'
import { testEmail, testPassword } from './test-credentials'

test.describe('REQ-001 customer login', () => {
  test('logs into the real API and loads the protected storefront', async ({ page }) => {
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
    await page.getByRole('button', { name: /giriş yap/i }).click()
    const loginResponse = await loginResponsePromise

    expect(loginResponse.status()).toBe(200)
    const homeResponse = await homeResponsePromise
    expect(homeResponse.status()).toBe(200)

    await expect(
      page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeVisible()
    await expect(page.getByText(testEmail, { exact: false })).toBeVisible()
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0)

    await page.getByRole('button', { name: /çıkış yap/i }).click()
    await expect(page.getByRole('heading', { name: 'Merhaba.' })).toBeVisible()
  })

  test('shows a generic error for invalid credentials without calling the home API', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByLabel('E-posta adresi').fill(testEmail)
    await page.getByLabel('Parola', { exact: true }).fill('incorrect-password')
    let homeRequestCount = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/home')) {
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
