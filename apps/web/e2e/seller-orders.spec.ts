import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'
import { createTestProduct } from '../src/test/testData'
import { createKeycloakAdminClient, createKeycloakTestAdmin } from './keycloakAdmin'
import { KeycloakLoginPage } from './keycloakLoginPage'

const keycloakE2EEnabled = process.env.E2E_KEYCLOAK_E2E === '1'

function createCredentials(prefix: string) {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `${prefix}-${uniqueId}@example.com`,
    password: `LivaE2E-${uniqueId}!Aa`,
  }
}

async function registerBuyer(page: Page, email: string, password: string): Promise<Response> {
  await page.goto('/')
  await page.getByRole('button', { name: /alıcı hesabı oluştur/i }).click()
  await expect(page).toHaveURL(/localhost:8080/)
  await page.getByRole('link', { name: 'Register' }).click()
  await page.locator('#firstName').fill('Test')
  await page.locator('#lastName').fill('Marketplace User')
  await page.locator('#email').fill(email)
  const username = page.locator('#username')
  if (await username.count()) await username.fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#password-confirm').fill(password)
  const identity = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/me') &&
      response.request().method() === 'GET',
  )
  await page.locator('#kc-register-form input[type="submit"]').click()
  return identity
}

async function applyAsSeller(page: Page, storeName: string) {
  await page.getByRole('button', { name: 'Satıcı olarak başvur' }).click()
  await page.getByLabel('Yasal ad / unvan').fill(`${storeName} Ltd.`)
  await page.getByLabel('Yetkili kişi').fill('Test Seller')
  await page.getByLabel('Mağaza adı').fill(storeName)
  await page.getByLabel('İletişim telefonu').fill('+905551234567')
  await page.getByLabel('İl', { exact: true }).fill('Istanbul')
  await page.getByLabel('İlçe', { exact: true }).fill('Kadikoy')
  await page.getByLabel('Ana ürün kategorisi').fill('Kişisel bakım')
  await page.getByLabel('İşletme / mağaza açıklaması')
    .fill('Test mağazası; gerçek KYC/KYB işlemi yapılmaz.')
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/seller-applications/me/submit') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Başvuruyu gönder' }).click()
  expect((await submitted).status()).toBe(200)
}

async function approveSeller(page: Page, storeName: string) {
  const openButton = page.getByRole('button', { name: 'Satıcı başvurularını yönet' })
  if (await openButton.count()) await openButton.click()
  const panel = page.getByRole('region', { name: 'Satıcı başvuruları' })
  await panel.getByRole('button', { name: 'Yenile' }).click()
  const application = panel.getByRole('article').filter({ hasText: storeName })
  await expect(application).toBeVisible()
  await application.getByRole('button', { name: 'İncelemeye al' }).click()
  await application.getByRole('button', { name: 'Onayla' }).click()
  await expect(application.getByText('Onaylandı', { exact: true })).toBeVisible()
}

async function createSellerProduct(
  page: Page,
  product: ReturnType<typeof createTestProduct>,
) {
  await page.getByRole('button', { name: '+ Ürün ekle' }).click()
  await page.getByLabel('Ürün adı').fill(product.name)
  await page.getByLabel('Kategori').fill(product.category)
  await page.getByLabel('Açıklama').fill(product.description)
  await page.getByLabel('Fiyat (TL)').fill(product.price)
  await page.getByLabel('Stok adedi').fill(String(product.stock))
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/products') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Ürünü kaydet' }).click()
  expect((await created).status()).toBe(201)
}

async function addDefaultAddress(page: Page) {
  await page.getByRole('button', { name: 'Adreslerim', exact: true }).click()
  await page.getByLabel('Adres başlığı').fill('E2E Home')
  await page.getByLabel('Alıcı adı').fill('Test Buyer')
  await page.getByLabel('Telefon').fill('+905551234567')
  await page.getByLabel('İl', { exact: true }).fill('Istanbul')
  await page.getByLabel('İlçe', { exact: true }).fill('Kadikoy')
  await page.getByLabel('Açık adres').fill('Marketplace Street 10')
  await page.getByLabel('Posta kodu (isteğe bağlı)').fill('34710')
  await page.getByLabel('Varsayılan teslimat adresim yap').check()
  const address = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/addresses') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Adresi kaydet' }).click()
  const createdAddress = await address
  expect(createdAddress.status()).toBe(201)
  const { id } = (await createdAddress.json()) as { id: number }
  const cartToggle = page.getByRole('button', { name: /^Sepet \(\d+\)$/ })
  const cartWasOpen = (await cartToggle.getAttribute('aria-expanded')) === 'true'
  if (!cartWasOpen) await cartToggle.click()
  await expect(page.getByRole('combobox', { name: 'Teslimat adresi' }))
    .toHaveValue(String(id))
  if (!cartWasOpen) await cartToggle.click()
  await page.getByRole('button', { name: 'Adres defterini kapat' }).click()
}

async function loginSeller(page: Page, email: string, password: string) {
  await page.getByRole('button', { name: /çıkış yap/i }).click()
  await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible()
  const identity = await new KeycloakLoginPage(page).login(email, password)
  expect(identity.status()).toBe(200)
  expect((await identity.json()).roles).toContain('seller')
}

test.describe('REQ-017 seller fulfillment workflow @keycloak', () => {
  test.skip(
    !keycloakE2EEnabled,
    'Set E2E_KEYCLOAK_E2E=1 and configure local seller role provisioning to run this test.',
  )

  test('two sellers manage isolated packages and buyer/admin see the shared order', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(120_000)
    const admin = await createKeycloakTestAdmin(request)
    const adminLogin = new KeycloakLoginPage(adminPage)
    const sellerAContext = await browser.newContext()
    const sellerBContext = await browser.newContext()
    const buyerContext = await browser.newContext()
    const sellerAPage = await sellerAContext.newPage()
    const sellerBPage = await sellerBContext.newPage()
    const buyerPage = await buyerContext.newPage()
    const sellerA = createCredentials('seller-a')
    const sellerB = createCredentials('seller-b')
    const buyer = createCredentials('marketplace-buyer')
    const storeA = `E2E Store A ${Date.now()}`
    const storeB = `E2E Store B ${Date.now()}`
    const productA = createTestProduct({ stock: 5, price: '12.50' })
    const productB = createTestProduct({ stock: 5, price: '25.00' })

    try {
      await test.step('Prepare admin and approve two seller accounts', async () => {
        expect((await adminLogin.login(admin.email, admin.password)).status()).toBe(200)
        expect((await registerBuyer(sellerAPage, sellerA.email, sellerA.password)).status())
          .toBe(200)
        await applyAsSeller(sellerAPage, storeA)
        await approveSeller(adminPage, storeA)
        await loginSeller(sellerAPage, sellerA.email, sellerA.password)
        await createSellerProduct(sellerAPage, productA)

        expect((await registerBuyer(sellerBPage, sellerB.email, sellerB.password)).status())
          .toBe(200)
        await applyAsSeller(sellerBPage, storeB)
        await approveSeller(adminPage, storeB)
        await loginSeller(sellerBPage, sellerB.email, sellerB.password)
        await createSellerProduct(sellerBPage, productB)
      })

      expect((await registerBuyer(buyerPage, buyer.email, buyer.password)).status()).toBe(200)
      await buyerPage.getByRole('button', { name: `Sepete ekle ${productA.name}` }).click()
      await buyerPage.getByRole('button', { name: `Sepete ekle ${productB.name}` }).click()
      await addDefaultAddress(buyerPage)
      const checkout = buyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/orders') &&
          response.request().method() === 'POST',
      )
      await buyerPage.getByRole('button', { name: 'Siparişi oluştur' }).click()
      const createdOrder = await checkout
      expect(createdOrder.status()).toBe(201)
      const order = (await createdOrder.json()) as {
        id: number
        fulfillments: Array<{ store_name: string; items: Array<{ product_name: string }> }>
      }
      expect(order.fulfillments).toHaveLength(2)
      expect(order.fulfillments.map((fulfillment) => fulfillment.store_name).sort())
        .toEqual([storeA, storeB].sort())
      expect(order.fulfillments.flatMap((fulfillment) =>
        fulfillment.items.map((item) => item.product_name),
      ).sort()).toEqual([productA.name, productB.name].sort())

      await buyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await buyerPage.getByRole('button', { name: 'Ödemeye devam et' }).click()
      await buyerPage.getByRole('link', { name: 'Güvenli test ödeme sayfasına git' }).click()
      await buyerPage.getByRole('button', { name: 'Test ödemesini başarılı yap' }).click()
      await buyerPage.goto('/')
      await sellerAPage.reload()
      await sellerBPage.reload()

      await test.step('Keep seller package views isolated and update each independently', async () => {
        const sellerAOrders = sellerAPage.getByRole('region', { name: 'Siparişlerim' })
        const sellerBOrders = sellerBPage.getByRole('region', { name: 'Siparişlerim' })
        await expect(sellerAOrders.getByText(productA.name)).toBeVisible()
        await expect(sellerAOrders.getByText(productB.name)).toHaveCount(0)
        await expect(sellerBOrders.getByText(productB.name)).toBeVisible()
        await expect(sellerBOrders.getByText(productA.name)).toHaveCount(0)
        const sellerACard = sellerAOrders.getByRole('article')
          .filter({ hasText: productA.name })
        const sellerBCard = sellerBOrders.getByRole('article')
          .filter({ hasText: productB.name })
        await sellerACard.getByRole('button', { name: 'Hazırlanmaya al' }).click()
        await expect(sellerACard.getByText('Hazırlanıyor')).toBeVisible()
        await expect(sellerBCard.getByText('Ödendi')).toBeVisible()
        await sellerBCard.getByRole('button', { name: 'Hazırlanmaya al' }).click()
        await sellerACard.getByRole('button', { name: 'Gönderildi olarak işaretle' }).click()
        await sellerBCard.getByRole('button', { name: 'Gönderildi olarak işaretle' }).click()
        await sellerACard.getByRole('button', { name: 'Teslim edildi olarak işaretle' }).click()
        await sellerBCard.getByRole('button', { name: 'Teslim edildi olarak işaretle' }).click()
      })

      await test.step('Verify buyer package statuses and admin oversight', async () => {
        await buyerPage.reload()
        await buyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
        const buyerPackages = buyerPage.getByRole('region', {
          name: `Sipariş ${order.id} satıcı paketleri`,
        })
        await expect(buyerPackages.getByText(storeA)).toBeVisible()
        await expect(buyerPackages.getByText(storeB)).toBeVisible()
        await expect(buyerPackages.getByText('Teslim edildi', { exact: true })).toHaveCount(2)

        await adminPage.getByRole('button', { name: 'Mağazaya dön' }).click()
        const adminOrders = adminPage.getByRole('region', { name: 'Sipariş yönetimi' })
        await adminOrders.getByRole('button', { name: 'Yenile' }).click()
        const adminOrder = adminOrders.getByRole('article')
          .filter({ hasText: `Sipariş #${order.id}` })
        await expect(adminOrder.getByText(storeA)).toBeVisible()
        await expect(adminOrder.getByText(storeB)).toBeVisible()
        const adminPackages = adminOrder.getByRole('region', {
          name: `Sipariş ${order.id} satıcı paketleri`,
        })
        await expect(adminPackages.getByText(productA.name)).toBeVisible()
        await expect(adminPackages.getByText(productB.name)).toBeVisible()
      })
    } finally {
      try {
        const keycloakAdmin = await createKeycloakAdminClient(request)
        await Promise.all([
          keycloakAdmin.deleteUserByEmail(sellerA.email),
          keycloakAdmin.deleteUserByEmail(sellerB.email),
          keycloakAdmin.deleteUserByEmail(buyer.email),
        ])
      } finally {
        try {
          await admin.cleanup()
        } finally {
          await Promise.all([
            sellerAContext.close(),
            sellerBContext.close(),
            buyerContext.close(),
          ])
        }
      }
    }
  })
})
