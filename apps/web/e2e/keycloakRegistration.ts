import { expect } from '@playwright/test'
import type { APIRequestContext, Locator, Page, Response } from '@playwright/test'
import { recipientEmailLink } from './mailpit'

export async function openRegistrationForm(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
  await page.getByRole('link', { name: 'Register' }).click()
  const form = page.locator('#kc-register-form')
  await expect(form).toBeVisible()
  return form
}

export async function fillRegistrationForm(
  page: Page,
  email: string,
  lastName: string,
): Promise<Locator> {
  const form = await openRegistrationForm(page)
  await page.locator('#firstName').fill('Test')
  await page.locator('#lastName').fill(lastName)
  await page.locator('#email').fill(email)
  const username = page.locator('#username')
  if (await username.count()) await username.fill(email)
  return form
}

export async function completeRegistration(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
  form: Locator,
): Promise<Response> {
  await form.locator('input[type="submit"]').click()
  const verifyLink = await recipientEmailLink(request, email, 'Verify email')
  await page.goto(verifyLink)
  await expect(page.locator('#password-new')).toBeVisible()
  await page.locator('#password-new').fill(password)
  await page.locator('#password-confirm').fill(password)
  const identity = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') &&
      response.request().method() === 'GET',
    { timeout: 15_000 },
  )
  await page.locator('input[type="submit"], button[type="submit"]').first().click()
  return identity
}

export async function registerBuyer(
  page: Page,
  email: string,
  password: string,
  lastName = 'Buyer',
): Promise<Response> {
  const form = await fillRegistrationForm(page, email, lastName)
  return completeRegistration(page, page.request, email, password, form)
}
