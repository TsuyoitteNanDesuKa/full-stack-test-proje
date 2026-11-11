import { expect, test } from '@playwright/test'
import type { Locator, Page, Response } from '@playwright/test'
import { createTestProduct, productRequest } from '../src/test/testData'
import { createKeycloakAdminClient } from './keycloakAdmin'
import { KeycloakLoginPage } from './keycloakLoginPage'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'
const temporaryBuyerEmails = new Map<string, string>()

function createBuyerCredentials() {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `buyer-${uniqueId}@example.com`,
    password: `LivaE2E-${uniqueId}!Aa`,
  }
}

async function openRegistrationForm(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
  await expect(page).toHaveURL(/localhost:8080/)
  await page.getByRole('link', { name: 'Register' }).click()

  const form = page.locator('#kc-register-form')
  await expect(form).toBeVisible()
  return form
}

async function fillRegistrationForm(
  page: Page,
  email: string,
  password: string,
): Promise<Locator> {
  const form = await openRegistrationForm(page)
  await page.locator('#firstName').fill('Test')
  await page.locator('#lastName').fill('Buyer')
  await page.locator('#email').fill(email)
  const username = page.locator('#username')
  if (await username.count() > 0) {
    await username.fill(email)
  }
  await page.locator('#password').fill(password)
  await page.locator('#password-confirm').fill(password)
  return form
}

async function submitRegistration(page: Page, form: Locator): Promise<Response> {
  const identityResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') &&
      response.request().method() === 'GET',
  )
  await form.locator('input[type="submit"]').click()
  return identityResponsePromise
}

test.describe('REQ-001 authentication and REQ-006 buyer registration @keycloak', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and start the local Keycloak realm to run these tests.',
  )

  test.afterEach(async ({ request }, testInfo) => {
    const email = temporaryBuyerEmails.get(testInfo.testId)
    if (!email) {
      return
    }

    temporaryBuyerEmails.delete(testInfo.testId)
    const keycloakAdmin = await createKeycloakAdminClient(request)
    await keycloakAdmin.deleteUserByEmail(email)
  })

  test('registers a buyer through Keycloak and denies product administration', async ({
    page,
    request,
  }, testInfo) => {
    const { email, password } = createBuyerCredentials()
    temporaryBuyerEmails.set(testInfo.testId, email)
    const shopApiRequestBodies: string[] = []
    page.on('request', (requestEvent) => {
      if (requestEvent.url().includes('/api/v1/')) {
        shopApiRequestBodies.push(requestEvent.postData() ?? '')
      }
    })
    const registrationForm = await fillRegistrationForm(page, email, password)
    const registrationIdentity = await submitRegistration(page, registrationForm)
    expect(registrationIdentity.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' })).toBeVisible()

    await page.getByRole('button', { name: /çıkış yap/i }).click()
    await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible()
    const identityResponse = await new KeycloakLoginPage(page).login(email, password)

    const accessToken = identityResponse.request().headers()['authorization']
    expect(accessToken).toMatch(/^Bearer /)
    const tokenClaims = JSON.parse(
      Buffer.from(accessToken.slice('Bearer '.length).split('.')[1], 'base64url').toString(),
    ) as { iss?: string; aud?: string | string[]; realm_access?: { roles?: string[] } }
    const audiences = Array.isArray(tokenClaims.aud) ? tokenClaims.aud : [tokenClaims.aud]
    expect(audiences).toContain('shop-api')
    expect(identityResponse.status(), JSON.stringify({
      issuer: tokenClaims.iss,
      audience: tokenClaims.aud,
      roles: tokenClaims.realm_access?.roles,
    })).toBe(200)
    const identity: { roles: string[]; is_admin: boolean } = await identityResponse.json()
    expect(identity.roles).toContain('buyer')
    expect(identity.roles).not.toContain('seller')
    expect(identity.roles).not.toContain('admin')
    expect(identity.is_admin).toBe(false)

    await expect(
      page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toHaveCount(0)
    expect(shopApiRequestBodies.join('\n')).not.toContain(password)

    const deniedProductCreate = await request.post('http://127.0.0.1:8001/api/v1/products', {
      data: productRequest(createTestProduct()),
      headers: { authorization: accessToken },
    })
    expect(deniedProductCreate.status()).toBe(403)
  })

  test('rejects a second registration with an existing email', async ({ page }, testInfo) => {
    const { email, password } = createBuyerCredentials()
    temporaryBuyerEmails.set(testInfo.testId, email)
    const initialRegistrationForm = await fillRegistrationForm(page, email, password)
    const initialIdentityResponse = await submitRegistration(page, initialRegistrationForm)
    expect(initialIdentityResponse.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' })).toBeVisible()

    await page.getByRole('button', { name: /çıkış yap/i }).click()
    await expect(page.getByRole('button', { name: /alıcı hesabı oluştur/i })).toBeVisible()

    const duplicateRegistrationForm = await fillRegistrationForm(page, email, password)
    await duplicateRegistrationForm.locator('input[type="submit"]').click()

    await expect(
      page.getByText(
        'Unable to create an account with the provided details. Review your information or try signing in.',
      ),
    ).toBeVisible()
    await expect(
      page.getByText(/already associated with an existing account/i),
    ).toHaveCount(0)
    await expect(duplicateRegistrationForm).toBeVisible()
    await expect(page).toHaveURL(/login-actions\/registration/)
  })

  test('keeps an invalid login on Keycloak without calling protected shop APIs', async ({
    page,
  }) => {
    const shopApiRequests: string[] = []
    page.on('request', (requestEvent) => {
      if (requestEvent.url().includes('/api/v1/')) {
        shopApiRequests.push(requestEvent.url())
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /giriş yap/i }).click()
    await expect(page).toHaveURL(/localhost:8080/)
    await page.locator('#username').fill(`missing-${Date.now()}@example.com`)
    await page.locator('#password').fill(`LivaE2E-${Date.now()}-Invalid!Aa`)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByText(/invalid username or password/i)).toBeVisible()
    await expect(page).toHaveURL(/login-actions\/authenticate/)
    expect(shopApiRequests).toEqual([])
  })

  test('prevents submission when required fields are missing or the email is malformed', async ({
    page,
  }) => {
    const form = await openRegistrationForm(page)
    const firstName = page.locator('#firstName')
    const email = page.locator('#email')

    await form.locator('input[type="submit"]').click()
    await expect(firstName).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/login-actions\/registration/)

    await firstName.fill('Test')
    await page.locator('#lastName').fill('Buyer')
    await email.fill(createBuyerCredentials().email)
    await page.locator('#password').fill('LivaE2E-Valid-Password!Aa')
    await page.locator('#password-confirm').fill('LivaE2E-Different-Password!Aa')
    await form.locator('input[type="submit"]').click()
    await expect(page.getByText(/password confirmation doesn't match/i)).toBeVisible()
    await expect(page).toHaveURL(/login-actions\/registration/)

    await page.locator('#password-confirm').fill('LivaE2E-Valid-Password!Aa')
    await email.fill('not-an-email')
    await form.locator('input[type="submit"]').click()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/login-actions\/registration/)
  })
})
