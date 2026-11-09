import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const databasePath = resolve(
  process.env.PLAYWRIGHT_E2E_DATABASE_PATH ??
    resolve(tmpdir(), `liva-playwright-${process.pid}.sqlite`),
)
const databaseUrl = `sqlite:///${databasePath.replaceAll('\\', '/')}`
const apiPort = 8001
const webPort = 5174
const oidcPort = 8082
const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'
const oidcIssuer = keycloakE2EEnabled
  ? process.env.E2E_KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/shop'
  : `http://127.0.0.1:${oidcPort}/realms/e2e`
const oidcJwksUrl =
  (keycloakE2EEnabled && process.env.E2E_KEYCLOAK_JWKS_URL
    ? process.env.E2E_KEYCLOAK_JWKS_URL
    : undefined) ??
  `${oidcIssuer}/protocol/openid-connect/certs`

if (
  !keycloakE2EEnabled &&
  (!process.env.E2E_TEST_PRIVATE_KEY_PATH || !process.env.E2E_TEST_PUBLIC_JWK)
) {
  throw new Error('Run E2E through npm run test:e2e to create the isolated test identity key.')
}

const sharedEnvironment = {
  SHOP_DATABASE_URL: databaseUrl,
  SHOP_OIDC_ISSUER: oidcIssuer,
  SHOP_OIDC_AUDIENCE: 'shop-api',
  SHOP_OIDC_JWKS_URL: oidcJwksUrl,
  E2E_DATABASE_PATH: databasePath,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
      ]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    ...(!keycloakE2EEnabled
      ? [
          {
            command: 'node e2e/start-test-identity.mjs',
            url: oidcJwksUrl,
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
              E2E_TEST_PUBLIC_JWK: process.env.E2E_TEST_PUBLIC_JWK,
              E2E_OIDC_PORT: String(oidcPort),
            },
          },
        ]
      : []),
    {
      command: 'node e2e/start-api.mjs',
      url: `http://127.0.0.1:${apiPort}/openapi.json`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...sharedEnvironment,
        E2E_API_PORT: String(apiPort),
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
        VITE_OIDC_AUTHORITY: oidcIssuer,
        VITE_OIDC_CLIENT_ID: 'shop-web',
      },
    },
  ],
})
