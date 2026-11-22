import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page } from '@playwright/test'
import { createKeycloakAdminClient } from './keycloakAdmin'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'
const mailpitUrl = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025'

interface MailpitSummary {
  messages: Array<{ ID: string; Subject: string; Created: string; To: Array<{ Address: string }> }>
}

function uniqueBuyer() {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `p6-${id}@example.com`,
    password: `LivaP6-${id}!Aa`,
    newPassword: `LivaP6-reset-${id}!Bb`,
  }
}

// Reads the link from the newest Mailpit message addressed to this test's account.
async function recipientEmailLink(
  request: APIRequestContext,
  recipient: string,
  subject: string,
): Promise<string> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`)
    const summary = (await list.json()) as MailpitSummary
    // Take the most recent matching message so an earlier, expired link is never used.
    const match = summary.messages
      .filter(
        (message) =>
          message.Subject === subject &&
          message.To.some((to) => to.Address === recipient),
      )
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
    if (match) {
      const detail = await request.get(`${mailpitUrl}/api/v1/message/${match.ID}`)
      const text = String(((await detail.json()) as { Text?: string }).Text ?? '')
      const link = text.match(/https?:\/\/\S+/)?.[0]
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No "${subject}" email for the test account arrived in Mailpit.`)
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

// Ends any Keycloak SSO session so the next sign-in starts from the login form.
async function endKeycloakSession(page: Page) {
  await page.goto('http://localhost:8080/realms/shop/protocol/openid-connect/logout?client_id=shop-web&post_logout_redirect_uri=http%3A%2F%2F127.0.0.1%3A5174%2F')
  await page.waitForLoadState('domcontentloaded')
  // The app keeps its own OIDC user in session storage; clear it so the sign-in screen is shown.
  await page.goto('/')
  await page.evaluate(() => {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('oidc.')) window.sessionStorage.removeItem(key)
    }
  })
  await page.reload()
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
