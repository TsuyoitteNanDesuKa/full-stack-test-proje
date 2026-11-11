import { expect } from '@playwright/test'
import type { Page, Response } from '@playwright/test'

export class KeycloakLoginPage {
  constructor(private readonly page: Page) {}

  async login(email: string, password: string): Promise<Response> {
    await this.page.goto('/')
    await this.page.getByRole('button', { name: /giriş yap/i }).click()
    await expect(this.page).toHaveURL(/localhost:8080/)
    await this.page.locator('#username').fill(email)
    await this.page.locator('#password').fill(password)

    const identityResponse = this.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/me') &&
        response.request().method() === 'GET',
    )
    await this.page.getByRole('button', { name: 'Sign In' }).click()
    return identityResponse
  }
}
