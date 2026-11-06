import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { createTestProduct } from '../src/test/testData'
import { createKeycloakAdminClient, createKeycloakTestAdmin } from './keycloakAdmin'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

function createBuyerCredentials() {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `cart-buyer-${uniqueId}@example.com`,
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
  await page.locator('#lastName').fill('Cart Buyer')
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

async function createProduct(page: Page, product: ReturnType<typeof createTestProduct>) {
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

test.describe('REQ-009 cart, REQ-010 checkout, and REQ-012 order lifecycle', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and configure the local Keycloak admin credentials.',
  )

  test('buyer manages a persistent private cart and can remove a deleted product', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(120_000)
    const admin = await createKeycloakTestAdmin(request)
    const firstBuyerContext = await browser.newContext()
    const firstBuyerPage = await firstBuyerContext.newPage()
    const secondBuyerContext = await browser.newContext()
    const secondBuyerPage = await secondBuyerContext.newPage()
    const firstBuyer = createBuyerCredentials()
    const secondBuyer = createBuyerCredentials()
    const product = createTestProduct({ stock: 5, price: '12.50' })

    try {
      const adminLogin = await login(adminPage, admin.email, admin.password)
      expect(adminLogin.status()).toBe(200)
      const productResponse = await createProduct(adminPage, product)
      expect(productResponse.status()).toBe(201)
      const createdProduct = (await productResponse.json()) as { id: number }

      const firstRegistration = await registerBuyer(
        firstBuyerPage,
        firstBuyer.email,
        firstBuyer.password,
      )
      expect(firstRegistration.status()).toBe(200)
      expect((await firstRegistration.json()).roles).toContain('buyer')
      await firstBuyerPage.getByRole('searchbox', { name: 'Ürün ara' }).fill(product.name)
      const filteredProductsResponse = firstBuyerPage.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/products?') &&
          new URL(response.url()).searchParams.get('search') === product.name,
      )
      await firstBuyerPage.getByRole('button', { name: 'Filtrele' }).click()
      expect((await filteredProductsResponse).status()).toBe(200)
      await expect(
        firstBuyerPage.getByRole('row').filter({ hasText: product.name }),
      ).toBeVisible()
      await firstBuyerPage.getByRole('searchbox', { name: 'Ürün ara' }).fill('no-match')
      const emptySearchResponse = firstBuyerPage.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/products?') &&
          new URL(response.url()).searchParams.get('search') === 'no-match',
      )
      await firstBuyerPage.getByRole('button', { name: 'Filtrele' }).click()
      expect((await emptySearchResponse).status()).toBe(200)
      await expect(firstBuyerPage.getByText('Bu filtrelerle ürün bulunamadı.')).toBeVisible()
      await firstBuyerPage.getByRole('searchbox', { name: 'Ürün ara' }).fill('')
      await firstBuyerPage.getByRole('button', { name: 'Filtrele' }).click()
      await expect(
        firstBuyerPage.getByRole('row').filter({ hasText: product.name }),
      ).toBeVisible()
      await firstBuyerPage.getByRole('button', {
        name: `Sepete ekle ${product.name}`,
      }).click()
      await expect(firstBuyerPage.getByRole('heading', { name: 'Sepetim' })).toBeVisible()
      const quantity = firstBuyerPage.getByRole('spinbutton', {
        name: `Miktar: ${product.name}`,
      })
      await quantity.fill('2')
      await firstBuyerPage.getByRole('button', { name: 'Miktarı güncelle' }).click()
      await expect(firstBuyerPage.getByRole('button', { name: 'Sepet (2)' })).toBeVisible()

      await firstBuyerPage.reload()
      await expect(firstBuyerPage.getByRole('button', { name: 'Sepet (2)' })).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Sepet (2)' }).click()
      await expect(
        firstBuyerPage.getByRole('spinbutton', { name: `Miktar: ${product.name}` }),
      ).toHaveValue('2')

      const checkoutResponse = firstBuyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/orders') &&
          response.request().method() === 'POST',
      )
      await firstBuyerPage.getByRole('button', { name: 'Siparişi oluştur' }).click()
      const createdOrderResponse = await checkoutResponse
      expect(createdOrderResponse.status()).toBe(201)
      const createdOrder = (await createdOrderResponse.json()) as {
        id: number
        total_amount: string
      }
      expect(createdOrder.total_amount).toBe('25.00')
      await expect(firstBuyerPage.getByText('Ödeme adımı bekleniyor.')).toBeVisible()
      await expect(firstBuyerPage.getByRole('button', { name: 'Sepet (0)' })).toBeVisible()

      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(
        firstBuyerPage.getByRole('heading', { name: `Sipariş #${createdOrder.id}` }),
      ).toBeVisible()
      await expect(
        firstBuyerPage.getByText(`${product.name} · 2 adet · ₺25,00`),
      ).toBeVisible()
      await expect(firstBuyerPage.getByText('Sipariş oluşturuldu')).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Ödemeye devam et' }).click()
      const checkoutLink = firstBuyerPage.getByRole('link', {
        name: 'Güvenli test ödeme sayfasına git',
      })
      await expect(checkoutLink).toBeVisible()
      await checkoutLink.click()
      await expect(firstBuyerPage.getByRole('heading', {
        name: 'Test ödeme sayfası',
      })).toBeVisible()
      await firstBuyerPage.getByRole('button', {
        name: 'Test ödemesini başarılı yap',
      }).click()
      await expect(firstBuyerPage.getByRole('status')).toHaveText('Ödeme durumu: succeeded')
      await firstBuyerPage.goto('/')
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(firstBuyerPage.getByText('Ödendi', { exact: true })).toBeVisible()
      await expect(firstBuyerPage.getByText('Ödeme alındı')).toBeVisible()
      const adminOrders = adminPage.getByRole('region', { name: 'Sipariş yönetimi' })
      await adminOrders.getByRole('button', { name: 'Yenile' }).click()
      await expect(
        adminOrders.getByRole('heading', { name: `Sipariş #${createdOrder.id}` }),
      ).toBeVisible()
      await adminOrders.getByRole('button', {
        name: 'Hazırlanıyor aşamasına geçir',
      }).click()
      await adminOrders.getByLabel('İptal/iade nedeni').fill('E2E test iade talebi')
      await adminOrders.getByRole('button', {
        name: 'İptal et ve yerel iade kaydı oluştur',
      }).click()
      await expect(adminOrders.getByText(/yerel iade kaydı oluşturuldu/)).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(firstBuyerPage.getByText('İptal edildi', { exact: true })).toBeVisible()
      await expect(firstBuyerPage.getByText('Sipariş iptal edildi ve iade kaydı oluşturuldu'))
        .toBeVisible()

      await firstBuyerPage.getByRole('button', {
        name: `Sepete ekle ${product.name}`,
      }).click()
      await expect(firstBuyerPage.getByRole('button', { name: 'Sepet (1)' })).toBeVisible()

      const secondRegistration = await registerBuyer(
        secondBuyerPage,
        secondBuyer.email,
        secondBuyer.password,
      )
      expect(secondRegistration.status()).toBe(200)
      await expect(secondBuyerPage.getByRole('button', { name: 'Sepet (0)' })).toBeVisible()
      await secondBuyerPage.getByRole('button', { name: 'Sepet (0)' }).click()
      await expect(secondBuyerPage.getByText('Sepetin henüz boş.')).toBeVisible()

      adminPage.on('dialog', (dialog) => dialog.accept())
      const deleteResponse = adminPage.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/products/${createdProduct.id}`) &&
          response.request().method() === 'DELETE',
      )
      await adminPage.getByRole('button', { name: `Sil ${product.name}` }).click()
      expect((await deleteResponse).status()).toBe(204)

      await firstBuyerPage.reload()
      await firstBuyerPage.getByRole('button', { name: 'Sepet (1)' }).click()
      await expect(firstBuyerPage.getByText('Ürün artık mevcut değil.')).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Sepetten kaldır' }).click()
      await expect(firstBuyerPage.getByText('Sepetin henüz boş.')).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(
        firstBuyerPage.getByText(`${product.name} · 2 adet · ₺25,00`),
      ).toBeVisible()
    } finally {
      try {
        const keycloakAdmin = await createKeycloakAdminClient(request)
        await Promise.all([
          keycloakAdmin.deleteUserByEmail(firstBuyer.email),
          keycloakAdmin.deleteUserByEmail(secondBuyer.email),
        ])
      } finally {
        try {
          await admin.cleanup()
        } finally {
          await Promise.all([firstBuyerContext.close(), secondBuyerContext.close()])
        }
      }
    }
  })
})
