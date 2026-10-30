import { expect, test } from '@playwright/test'
import { createTestProduct, productRequest } from '../src/test/testData'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

test.describe('REQ-001 authentication and REQ-006 buyer registration', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and start the local Keycloak realm to run these tests.',
  )

  test('registers a buyer through Keycloak and denies product administration', async ({
    page,
    request,
  }) => {
    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
    const email = `buyer-${uniqueId}@example.com`
    const password = `LivaE2E-${uniqueId}!Aa`

    await page.goto('/')
    await page.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
    await expect(page).toHaveURL(/localhost:8080/)
    const registrationForm = page.locator('#kc-register-form')
    await expect(registrationForm).toBeVisible()

    await page.locator('#firstName').fill('Test')
    await page.locator('#lastName').fill('Buyer')
    await page.locator('#email').fill(email)
    const username = page.locator('#username')
    if (await username.isVisible().catch(() => false)) {
      await username.fill(email)
    }
    await page.locator('#password').fill(password)
    await page.locator('#password-confirm').fill(password)

    const identityResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/me') &&
        response.request().method() === 'GET',
    )
    await registrationForm.locator('input[type="submit"]').click()
    const identityResponse = await identityResponsePromise

    expect(identityResponse.status()).toBe(200)
    const identity: { roles: string[]; is_admin: boolean } = await identityResponse.json()
    expect(identity.roles).toContain('buyer')
    expect(identity.roles).not.toContain('seller')
    expect(identity.roles).not.toContain('admin')
    expect(identity.is_admin).toBe(false)

    await expect(
      page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toHaveCount(0)

    const accessToken = identityResponse.request().headers()['authorization']
    expect(accessToken).toMatch(/^Bearer /)
    const deniedProductCreate = await request.post('http://127.0.0.1:8001/api/v1/products', {
      data: productRequest(createTestProduct()),
      headers: { authorization: accessToken },
    })
    expect(deniedProductCreate.status()).toBe(403)
  })
})
