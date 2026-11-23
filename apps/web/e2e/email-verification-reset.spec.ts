import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { createKeycloakAdminClient } from './keycloakAdmin'
import { recipientEmailLink } from './mailpit'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

function uniqueBuyer() {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `p6-${id}@example.com`,
    password: `LivaP6-${id}!Aa`,
    newPassword: `LivaP6-reset-${id}!Bb`,
  }
}

// Starts each scenario signed out: clears the app session so the sign-in screen is shown.
async function startSignedOut(page: Page) {
  await page.goto('/')
  await page.evaluate(() => window.sessionStorage.clear())
  await page.goto('/')
  await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible()
}

// Keycloak's verification link opens a confirmation page that needs one more click.
async function confirmKeycloakAction(page: Page) {
  await page.getByText('Click here to proceed').click()
}

// Signs in through the real browser login form in a fresh browser context, so no
// Keycloak SSO or app session from an earlier step can make the result look successful.
// Success means Keycloak returned an authorization code to the app.
async function signInInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<boolean> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    return await signInInBrowser(page, email, password)
  } finally {
    await context.close()
  }
}

async function signInInBrowser(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/')
  await page.getByRole('button', { name: /giriş yap/i }).click()
  await page.waitForURL((url) => url.host.endsWith(':8080') || url.searchParams.has('code'), {
    timeout: 15_000,
  })
  if (new URL(page.url()).searchParams.has('code')) return true
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((url) => url.searchParams.has('code') || !url.host.endsWith(':8080'), {
    timeout: 15_000,
  }).catch(() => undefined)
  return new URL(page.url()).searchParams.has('code')
}

test.describe('REQ-019 email verification and password reset @keycloak', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and start the local Keycloak and Mailpit services to run these tests.',
  )

  test('unverified buyer cannot sign in, then verifies by email link and signs in', async ({
    page,
    browser,
    request,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createUnverifiedBuyer(buyer.email, buyer.password)
    try {
      expect(await signInInFreshContext(browser, buyer.email, buyer.password)).toBe(false)

      await admin.sendVerificationEmail(buyer.email)
      const verifyLink = await recipientEmailLink(request, buyer.email, 'Verify email')
      await page.goto(verifyLink)
      await confirmKeycloakAction(page)

      expect(await signInInFreshContext(browser, buyer.email, buyer.password)).toBe(true)
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })

  test('password and reset tokens never appear in app storage or in the app response bodies', async ({
    page,
    request,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createVerifiedBuyer(buyer.email, buyer.password)
    try {
      const bodies: string[] = []
      page.on('response', async (response) => {
        if (response.url().startsWith('http://127.0.0.1:5174') || response.url().includes('/api/')) {
          bodies.push(await response.text().catch(() => ''))
        }
      })

      await startSignedOut(page)
      await page.getByRole('button', { name: 'Parolamı unuttum' }).click()
      await page.locator('#username').fill(buyer.email)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()
      const resetLink = await recipientEmailLink(request, buyer.email, 'Reset password')
      await page.goto(resetLink)

      const storage = await page.evaluate(() =>
        JSON.stringify({ ...window.localStorage, ...window.sessionStorage }),
      )
      expect(storage).not.toContain(buyer.password)
      expect(storage).not.toContain(buyer.newPassword)
      expect(storage).not.toMatch(/"(access_token|refresh_token|code)"/)
      for (const body of bodies) {
        expect(body).not.toContain(buyer.password)
        expect(body).not.toContain(buyer.newPassword)
      }
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })

  test('the reset form rejects a weak password and keeps the old password', async ({
    page,
    request,
    browser,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createVerifiedBuyer(buyer.email, buyer.password)
    try {
      await page.goto('http://localhost:8080/realms/shop/login-actions/reset-credentials?client_id=shop-web&redirect_uri=http%3A%2F%2F127.0.0.1%3A5174%2F')
      await page.locator('#username').fill(buyer.email)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()
      const resetLink = await recipientEmailLink(request, buyer.email, 'Reset password')
      await page.goto(resetLink)

      await page.locator('#password-new').fill('abc')
      await page.locator('#password-confirm').fill('abc')
      await page.locator('input[type="submit"], button[type="submit"]').first().click()

      await expect(page.getByText('Invalid password: minimum length 8.')).toBeVisible()
      expect(await signInInFreshContext(browser, buyer.email, buyer.password)).toBe(true)
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })

  test('a reused verification link does not verify again and reports it is already verified', async ({
    page,
    request,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createUnverifiedBuyer(buyer.email, buyer.password)
    try {
      await admin.sendVerificationEmail(buyer.email)
      const verifyLink = await recipientEmailLink(request, buyer.email, 'Verify email')
      await page.goto(verifyLink)
      await page.getByText('Click here to proceed').click()
      await page.waitForLoadState('domcontentloaded')

      await page.goto(verifyLink)
      await expect(page.getByText('Your email address has been verified already.')).toBeVisible()
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })

  test('the reset form rejects a confirmation that does not match the new password', async ({
    page,
    request,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createVerifiedBuyer(buyer.email, buyer.password)
    try {
      await page.goto('http://localhost:8080/realms/shop/login-actions/reset-credentials?client_id=shop-web&redirect_uri=http%3A%2F%2F127.0.0.1%3A5174%2F')
      await page.locator('#username').fill(buyer.email)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()
      const resetLink = await recipientEmailLink(request, buyer.email, 'Reset password')
      await page.goto(resetLink)

      await page.locator('#password-new').fill(buyer.newPassword)
      await page.locator('#password-confirm').fill(`${buyer.newPassword}-different`)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()

      await expect(page.getByText("Passwords don't match.")).toBeVisible()
      expect(await admin.passwordGrantStatus(buyer.email, buyer.newPassword)).toBeGreaterThanOrEqual(400)
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })

  test('forgotten password is reset through the emailed link and the new password works', async ({
    page,
    browser,
    request,
  }) => {
    const admin = await createKeycloakAdminClient(request)
    const buyer = uniqueBuyer()
    await admin.createVerifiedBuyer(buyer.email, buyer.password)
    try {
      await startSignedOut(page)
      await page.getByRole('button', { name: 'Parolamı unuttum' }).click()
      await expect(page).toHaveURL(/:8080\//)
      await page.locator('#username').fill(buyer.email)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()

      const resetLink = await recipientEmailLink(request, buyer.email, 'Reset password')
      await page.goto(resetLink)
      await page.locator('#password-new').fill(buyer.newPassword)
      await page.locator('#password-confirm').fill(buyer.newPassword)
      await page.locator('input[type="submit"], button[type="submit"]').first().click()

      expect(await signInInFreshContext(browser, buyer.email, buyer.password)).toBe(false)
      expect(await signInInFreshContext(browser, buyer.email, buyer.newPassword)).toBe(true)
    } finally {
      await admin.deleteUserByEmail(buyer.email)
    }
  })
})
