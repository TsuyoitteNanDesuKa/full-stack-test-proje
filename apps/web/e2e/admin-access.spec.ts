import { expect, test } from '@playwright/test'
import { createKeycloakTestAdmin } from './keycloakAdmin'
import { KeycloakLoginPage } from './keycloakLoginPage'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

test.describe('REQ-008 trusted admin role operations @keycloak', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and start the local Keycloak realm to run these tests.',
  )

  test('revoked admin loses admin access after signing in again', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    const admin = await createKeycloakTestAdmin(request)
    const keycloakLogin = new KeycloakLoginPage(page)

    try {
      const initialIdentity = await keycloakLogin.login(admin.email, admin.password)
      expect(initialIdentity.status()).toBe(200)
      expect((await initialIdentity.json()).is_admin).toBe(true)
      await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toBeVisible()

      await admin.revokeAdminRole()
      expect(await admin.hasAuditedAdminRoleRevocation()).toBe(true)
      await page.getByRole('button', { name: /çıkış yap/i }).click()
      await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible()

      const renewedIdentity = await keycloakLogin.login(admin.email, admin.password)
      expect(renewedIdentity.status()).toBe(200)
      const identity = (await renewedIdentity.json()) as {
        is_admin: boolean
        roles: string[]
      }
      expect(identity.is_admin).toBe(false)
      expect(identity.roles).not.toContain('admin')
      await expect(page.getByRole('button', { name: '+ Ürün ekle' })).toHaveCount(0)

      const authorization = renewedIdentity.request().headers()['authorization']
      const deniedReviewQueue = await request.get(
        'http://127.0.0.1:8001/api/v1/seller-applications',
        { headers: { authorization } },
      )
      expect(deniedReviewQueue.status()).toBe(403)
    } finally {
      await admin.cleanup()
    }
  })
})
