import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { createTestProduct } from '../src/test/testData'
import { createKeycloakAdminClient, createKeycloakTestAdmin } from './keycloakAdmin'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

function createBuyerCredentials() {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `seller-applicant-${uniqueId}@example.com`,
    password: `LivaE2E-${uniqueId}!Aa`,
  }
}

async function registerBuyer(
  page: Page,
  email: string,
  password: string,
): Promise<Response> {
  await page.goto('/')
  await page.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
  await expect(page).toHaveURL(/localhost:8080/)
  await page.getByRole('link', { name: 'Register' }).click()
  await page.locator('#firstName').fill('Test')
  await page.locator('#lastName').fill('Seller Applicant')
  await page.locator('#email').fill(email)
  const username = page.locator('#username')
  if (await username.count()) await username.fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password-confirm').fill(password)

  const identityResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') &&
      response.request().method() === 'GET',
  )
  await page.locator('#kc-register-form input[type="submit"]').click()
  return identityResponse
}

async function login(page: Page, email: string, password: string): Promise<Response> {
  await page.goto('/')
  await page.getByRole('button', { name: /giriş yap/i }).click()
  await expect(page).toHaveURL(/localhost:8080/)
  await page.locator('#username').fill(email)
  await page.locator('#password').fill(password)

  const identityResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') &&
      response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: 'Sign In' }).click()
  return identityResponse
}

async function createSellerProduct(
  page: Page,
  product: ReturnType<typeof createTestProduct>,
): Promise<Response> {
  await page.getByRole('button', { name: '+ Ürün ekle' }).click()
  await page.getByLabel('Ürün adı').fill(product.name)
  await page.getByLabel('Kategori').fill(product.category)
  await page.getByLabel('Açıklama').fill(product.description)
  await page.getByLabel('Fiyat (TL)').fill(product.price)
  await page.getByLabel('Stok adedi').fill(String(product.stock))
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/products') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
  return createResponse
}

test.describe('REQ-007 seller application workflow', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and configure local seller role provisioning to run this test.',
  )

  test('buyer applies, admin approves, and the buyer receives the seller role', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(120_000)
    const admin = await createKeycloakTestAdmin(request)
    const buyerContext = await browser.newContext()
    const buyerPage = await buyerContext.newPage()
    const catalogBuyerContext = await browser.newContext()
    const catalogBuyerPage = await catalogBuyerContext.newPage()
    const buyer = createBuyerCredentials()
    const catalogBuyer = createBuyerCredentials()
    const storeName = `E2E Store ${Date.now()}`

    try {
      const registrationResponse = await registerBuyer(buyerPage, buyer.email, buyer.password)
      expect(registrationResponse.status()).toBe(200)
      const registrationRoles = (await registrationResponse.json()).roles as string[]
      expect(registrationRoles).toContain('buyer')
      expect(registrationRoles).not.toContain('seller')
      expect(registrationRoles).not.toContain('admin')

      await buyerPage.getByRole('button', { name: 'Satıcı olarak başvur' }).click()
      await buyerPage.getByLabel('Yasal ad / unvan').fill('Liva Test Ticaret')
      await buyerPage.getByLabel('Yetkili kişi').fill('Test Buyer')
      await buyerPage.getByLabel('Mağaza adı').fill(storeName)
      await buyerPage.getByLabel('İletişim telefonu').fill('+905551234567')
      await buyerPage.getByLabel('İl', { exact: true }).fill('Istanbul')
      await buyerPage.getByLabel('İlçe', { exact: true }).fill('Kadikoy')
      await buyerPage.getByLabel('Ana ürün kategorisi').fill('Kişisel bakım')
      await buyerPage
        .getByLabel('İşletme / mağaza açıklaması')
        .fill('Natural personal care products for everyday use.')
      const submitResponsePromise = buyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/seller-applications/me/submit') &&
          response.request().method() === 'POST',
      )
      await buyerPage.getByRole('button', { name: 'Başvuruyu gönder' }).click()
      expect((await submitResponsePromise).status()).toBe(200)
      await expect(buyerPage.getByText('Gönderildi', { exact: true })).toBeVisible()

      const adminLogin = await login(adminPage, admin.email, admin.password)
      expect(adminLogin.status()).toBe(200)
      await adminPage.getByRole('button', { name: 'Satıcı başvurularını yönet' }).click()
      await expect(adminPage.getByText(storeName)).toBeVisible()
      await adminPage.getByRole('button', { name: 'İncelemeye al' }).click()
      await adminPage.getByRole('button', { name: 'Onayla' }).click()
      await expect(adminPage.getByText('Onaylandı', { exact: true })).toBeVisible()

      await buyerPage.getByRole('button', { name: /çıkış yap/i }).click()
      await expect(buyerPage.getByRole('button', { name: /giriş yap/i })).toBeVisible()
      const renewedIdentity = await login(buyerPage, buyer.email, buyer.password)
      expect(renewedIdentity.status()).toBe(200)
      const roles = (await renewedIdentity.json()).roles as string[]
      expect(roles).toContain('buyer')
      expect(roles).toContain('seller')
      await expect(buyerPage.getByText('Satıcı hesabın aktif.')).toBeVisible()

      const product = createTestProduct()
      const createResponse = await createSellerProduct(buyerPage, product)
      expect(createResponse.status()).toBe(201)
      await expect(
        buyerPage.getByRole('row').filter({ hasText: product.name }),
      ).toBeVisible()
      await expect(
        buyerPage.getByRole('button', { name: `Düzenle ${product.name}` }),
      ).toBeVisible()

      const catalogIdentity = await registerBuyer(
        catalogBuyerPage,
        catalogBuyer.email,
        catalogBuyer.password,
      )
      expect(catalogIdentity.status()).toBe(200)
      expect((await catalogIdentity.json()).roles).toContain('buyer')
      await expect(
        catalogBuyerPage.getByRole('row').filter({ hasText: product.name }),
      ).toBeVisible()
      await expect(
        catalogBuyerPage.getByRole('button', { name: `Düzenle ${product.name}` }),
      ).toHaveCount(0)
    } finally {
      try {
        const keycloakAdmin = await createKeycloakAdminClient(request)
        await Promise.all([
          keycloakAdmin.deleteUserByEmail(buyer.email),
          keycloakAdmin.deleteUserByEmail(catalogBuyer.email),
        ])
      } finally {
        try {
          await admin.cleanup()
        } finally {
          await Promise.all([buyerContext.close(), catalogBuyerContext.close()])
        }
      }
    }
  })
})
