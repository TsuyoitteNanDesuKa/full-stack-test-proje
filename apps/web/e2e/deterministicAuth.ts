import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

const testIssuer = 'http://127.0.0.1:8082/realms/e2e'
const testClientId = 'shop-web'
const testAudience = 'shop-api'
const keyId = 'liva-playwright-e2e'

export function createTestAccessToken(
  role: 'admin' | 'buyer',
  identitySuffix = 'default',
): string {
  const privateKeyPath = process.env.E2E_TEST_PRIVATE_KEY_PATH
  if (!privateKeyPath) {
    throw new Error('The ephemeral Playwright OIDC private key is not configured.')
  }

  const now = Math.floor(Date.now() / 1000)
  const subject = `qa019-${role}-${identitySuffix}`
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      aud: testAudience,
      email: `${subject}@example.com`,
      exp: now + 3600,
      iat: now,
      iss: testIssuer,
      realm_access: { roles: [role] },
      sub: subject,
    }),
  ).toString('base64url')
  const unsignedToken = `${header}.${payload}`
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsignedToken),
    readFileSync(privateKeyPath),
  ).toString('base64url')

  return `${unsignedToken}.${signature}`
}

export async function authenticateAs(
  page: Page,
  role: 'admin' | 'buyer',
  identitySuffix = 'default',
): Promise<void> {
  const subject = `qa019-${role}-${identitySuffix}`
  const accessToken = createTestAccessToken(role, identitySuffix)
  const now = Math.floor(Date.now() / 1000)
  await page.addInitScript(
    ({ storageKey, token, subject, expiresAt }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: token,
          expires_at: expiresAt,
          profile: { email: `${subject}@example.com`, sub: subject },
          scope: 'openid profile email',
          session_state: null,
          token_type: 'Bearer',
        }),
      )
    },
    {
      storageKey: `oidc.user:${testIssuer}:${testClientId}`,
      token: accessToken,
      subject,
      expiresAt: now + 3600,
    },
  )
}
