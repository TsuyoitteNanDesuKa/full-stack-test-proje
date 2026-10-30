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
const oidcIssuer = process.env.E2E_KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/shop'

const sharedEnvironment = {
  SHOP_DATABASE_URL: databaseUrl,
  SHOP_OIDC_ISSUER: oidcIssuer,
  SHOP_OIDC_AUDIENCE: 'shop-api',
  E2E_DATABASE_PATH: databasePath,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
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
