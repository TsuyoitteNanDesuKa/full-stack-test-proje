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

async function addDefaultAddress(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Adreslerim', exact: true }).click()
  await page.getByLabel('Adres başlığı').fill('E2E Home')
  await page.getByLabel('Alıcı adı').fill('Test Buyer')
  await page.getByLabel('Telefon').fill('+905551234567')
  await page.getByLabel('İl', { exact: true }).fill('Istanbul')
  await page.getByLabel('İlçe', { exact: true }).fill('Kadikoy')
  await page.getByLabel('Açık adres').fill('Checkout Street 10')
  await page.getByLabel('Posta kodu (isteğe bağlı)').fill('34710')
  await page.getByLabel('Varsayılan teslimat adresim yap').check()
  const addressResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/addresses') &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Adresi kaydet' }).click()
  const createdAddressResponse = await addressResponse
  expect(createdAddressResponse.status()).toBe(201)
  const createdAddress = (await createdAddressResponse.json()) as { id: number }
  const cartToggle = page.getByRole('button', { name: /^Sepet \(\d+\)$/ })
  const cartWasOpen = (await cartToggle.getAttribute('aria-expanded')) === 'true'
  if (!cartWasOpen) await cartToggle.click()
  await expect(page.getByRole('combobox', { name: 'Teslimat adresi' }))
    .toHaveValue(String(createdAddress.id))
  if (!cartWasOpen) await cartToggle.click()
  await page.getByRole('button', { name: 'Adres defterini kapat' }).click()
  return createdAddress.id
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
      const createdAddressId = await addDefaultAddress(firstBuyerPage)

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
        delivery_fee: string
        shipping_address: { address_line: string }
      }
      expect(createdOrder.total_amount).toBe('74.90')
      expect(createdOrder.delivery_fee).toBe('49.90')
      expect(createdOrder.shipping_address.address_line).toBe('Checkout Street 10')
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
      await expect(firstBuyerPage.getByText(/Checkout Street 10, Kadikoy, Istanbul/))
        .toBeVisible()
      await expect(firstBuyerPage.getByText('Standart teslimat · ₺49,90')).toBeVisible()

      await firstBuyerPage.getByRole('button', { name: 'Adreslerim', exact: true }).click()
      await firstBuyerPage.getByRole('button', { name: 'Düzenle', exact: true }).click()
      await firstBuyerPage.getByLabel('Açık adres').fill('Updated Street 20')
      const updateAddressResponse = firstBuyerPage.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/addresses/${createdAddressId}`) &&
          response.request().method() === 'PUT',
      )
      await firstBuyerPage.getByRole('button', { name: 'Değişiklikleri kaydet' }).click()
      expect((await updateAddressResponse).status()).toBe(200)
      await expect(firstBuyerPage.getByText(/Updated Street 20, Kadikoy, Istanbul/)).toBeVisible()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(firstBuyerPage.getByText(/Checkout Street 10, Kadikoy, Istanbul/))
        .toBeVisible()
      const deleteAddressResponse = firstBuyerPage.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/addresses/${createdAddressId}`) &&
          response.request().method() === 'DELETE',
      )
      await firstBuyerPage.getByRole('button', { name: 'Sil' }).click()
      expect((await deleteAddressResponse).status()).toBe(204)
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await firstBuyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(firstBuyerPage.getByText(/Checkout Street 10, Kadikoy, Istanbul/))
        .toBeVisible()

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
      const adminOrder = adminOrders
        .locator('article')
        .filter({ hasText: `Sipariş #${createdOrder.id}` })
      await expect(
        adminOrders.getByRole('heading', { name: `Sipariş #${createdOrder.id}` }),
      ).toBeVisible()
      await adminOrder.getByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }).click()
      await adminOrder.getByLabel('İptal/iade nedeni').fill('E2E test iade talebi')
      await adminOrder.getByRole('button', {
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

  test('express delivery stays paid at the free-standard threshold', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(90_000)
    const admin = await createKeycloakTestAdmin(request)
    const buyerContext = await browser.newContext()
    const buyerPage = await buyerContext.newPage()
    const buyer = createBuyerCredentials()
    const product = createTestProduct({ stock: 5, price: '1000.00' })

    try {
      expect((await login(adminPage, admin.email, admin.password)).status()).toBe(200)
      expect((await createProduct(adminPage, product)).status()).toBe(201)
      expect((await registerBuyer(buyerPage, buyer.email, buyer.password)).status()).toBe(200)
      await buyerPage.getByRole('button', { name: `Sepete ekle ${product.name}` }).click()
      await addDefaultAddress(buyerPage)
      await expect(buyerPage.getByRole('radio', { name: /Standart · Ücretsiz/ })).toBeChecked()
      await buyerPage.getByRole('radio', { name: /Hızlı · ₺89,90/ }).check()
      const orderResponse = buyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/orders') &&
          response.request().method() === 'POST',
      )
      await buyerPage.getByRole('button', { name: 'Siparişi oluştur' }).click()
      const response = await orderResponse
      expect(response.status()).toBe(201)
      const order = (await response.json()) as {
        id: number
        item_subtotal: string
        delivery_fee: string
        delivery_method: string
        total_amount: string
      }
      expect(order).toMatchObject({
        item_subtotal: '1000.00',
        delivery_method: 'express',
        delivery_fee: '89.90',
        total_amount: '1089.90',
      })
      await buyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      const paymentResponse = buyerPage.waitForResponse(
        (payment) =>
          payment.url().endsWith(`/api/v1/orders/${order.id}/payments`) &&
          payment.request().method() === 'POST',
      )
      await buyerPage.getByRole('button', { name: 'Ödemeye devam et' }).click()
      const payment = await paymentResponse
      expect(payment.status()).toBe(201)
      expect((await payment.json()).amount).toBe('1089.90')
      await expect(buyerPage.getByText('Hızlı teslimat · ₺89,90')).toBeVisible()
    } finally {
      try {
        const keycloakAdmin = await createKeycloakAdminClient(request)
        await keycloakAdmin.deleteUserByEmail(buyer.email)
      } finally {
        try {
          await admin.cleanup()
        } finally {
          await buyerContext.close()
        }
      }
    }
  })

  test('buyer can partially and fully return a shipped order within the return window', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(90_000)
    const admin = await createKeycloakTestAdmin(request)
    const buyerContext = await browser.newContext()
    const buyerPage = await buyerContext.newPage()
    const buyer = createBuyerCredentials()
    const product = createTestProduct({ stock: 5, price: '12.50' })

    try {
      const adminLogin = await login(adminPage, admin.email, admin.password)
      expect(adminLogin.status()).toBe(200)
      const createResponse = await createProduct(adminPage, product)
      expect(createResponse.status()).toBe(201)

      const registration = await registerBuyer(buyerPage, buyer.email, buyer.password)
      expect(registration.status()).toBe(200)
      const buyerSubject = (await registration.json()).subject as string
      await buyerPage.getByRole('button', { name: `Sepete ekle ${product.name}` }).click()
      await expect(buyerPage.getByRole('button', { name: 'Sepet (1)' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      await buyerPage.getByRole('spinbutton', { name: `Miktar: ${product.name}` }).fill('2')
      await buyerPage.getByRole('button', { name: 'Miktarı güncelle' }).click()
      await addDefaultAddress(buyerPage)
      const checkoutResponse = buyerPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/orders') &&
          response.request().method() === 'POST',
      )
      await buyerPage.getByRole('button', { name: 'Siparişi oluştur' }).click()
      const createdOrderResponse = await checkoutResponse
      expect(createdOrderResponse.status()).toBe(201)
      const createdOrder = (await createdOrderResponse.json()) as { id: number }
      await expect(buyerPage.getByText('Ödeme adımı bekleniyor.')).toBeVisible()

      await buyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await buyerPage.getByRole('button', { name: 'Ödemeye devam et' }).click()
      await buyerPage.getByRole('link', { name: 'Güvenli test ödeme sayfasına git' }).click()
      await buyerPage.getByRole('button', { name: 'Test ödemesini başarılı yap' }).click()
      await buyerPage.goto('/')

      const adminOrders = adminPage.getByRole('region', { name: 'Sipariş yönetimi' })
      await adminOrders.getByRole('button', { name: 'Yenile' }).click()
      const adminOrder = adminOrders
        .locator('article')
        .filter({ hasText: `Sipariş #${createdOrder.id}` })
      await expect(adminOrder).toBeVisible()
      await adminOrder.getByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }).click()
      await adminOrder.getByRole('button', { name: 'Kargoya verildi aşamasına geçir' }).click()
      await adminOrder.getByRole('button', { name: 'Teslim edildi aşamasına geçir' }).click()

      await buyerPage.getByRole('button', { name: 'Siparişlerim' }).click()
      await expect(buyerPage.getByText('Teslim edildi', { exact: true })).toBeVisible()
      await buyerPage.getByRole('button', { name: `İade et ${product.name}` }).click()
      await buyerPage.getByLabel('İade nedeni').fill('Ürünün yarısını iade ediyorum')
      await buyerPage.getByRole('button', { name: 'İade talebini gönder' }).click()
      await expect(buyerPage.getByText(/İade talebin otomatik onaylandı/)).toBeVisible()
      await expect(buyerPage.getByText(/1 adet · ₺12,50 · Otomatik onaylandı/)).toBeVisible()

      await buyerPage.getByRole('button', { name: `İade et ${product.name}` }).click()
      await buyerPage.getByLabel('İade nedeni').fill('Kalan ürünü de iade ediyorum')
      await buyerPage.getByRole('button', { name: 'İade talebini gönder' }).click()
      await expect(buyerPage.getByText('Kalan ürünü de iade ediyorum')).toBeVisible()
      await expect(
        buyerPage.getByRole('button', { name: `İade et ${product.name}` }),
      ).toHaveCount(0)

      const adminRefresh = adminPage.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/admin/orders') &&
          response.request().method() === 'GET',
      )
      await adminOrders.getByRole('button', { name: 'Yenile' }).click()
      const orders = await (await adminRefresh).json()
      const returnedOrder = orders.find(
        (order: {
          owner_subject: string
          payment_status: string
          returns: unknown[]
        }) =>
          order.owner_subject === buyerSubject &&
          order.payment_status === 'partially_refunded' &&
          order.returns.length === 2,
      )
      expect(returnedOrder).toBeDefined()
    } finally {
      try {
        const keycloakAdmin = await createKeycloakAdminClient(request)
        await keycloakAdmin.deleteUserByEmail(buyer.email)
      } finally {
        try {
          await admin.cleanup()
        } finally {
          await buyerContext.close()
        }
      }
    }
  })
})
