import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCartItem,
  ApiError,
  createProduct,
  createOrder,
  createAddress,
  createPayment,
  createProductReturn,
  createSellerApplication,
  deleteCartItem,
  deleteProduct,
  getCurrentUser,
  getAdminOrders,
  getHome,
  getMyCart,
  getMyAddresses,
  getMyOrder,
  getMyOrders,
  getMySellerApplication,
  getProducts,
  getSellerApplications,
  getSellerOrders,
  reviewSellerApplication,
  refundAdminOrder,
  submitMySellerApplication,
  updateCartItem,
  updateAddress,
  deleteAddress,
  updateAdminOrderStatus,
  updateSellerOrderStatus,
  updateProduct,
  updateMySellerApplication,
  withdrawMySellerApplication,
} from './api'
import { createTestProduct, productRequest } from './test/testData'

const apiTestProduct = createTestProduct()
const apiTestProductRequest = productRequest(apiTestProduct)
const sellerApplicationRequest = {
  applicant_type: 'company' as const,
  legal_name: 'Liva Kozmetik Ltd.',
  representative_name: 'Enes Aysel',
  store_name: 'Liva Care',
  contact_phone: '05551234567',
  city: 'İstanbul',
  district: 'Kadıköy',
  primary_category: 'Kişisel bakım',
  business_description: 'Doğal bakım ürünleri',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('identity API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('sends the OIDC bearer token to retrieve the current identity', async () => {
    const body = {
      subject: 'keycloak-buyer',
      email: 'customer@example.com',
      roles: ['buyer'],
      is_admin: false,
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))

    await expect(getCurrentUser('signed-token')).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer signed-token',
        },
      }),
    )
  })

  it('preserves API error status and detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Kimlik doğrulaması gerekli.' }, 401),
    )

    await expect(getCurrentUser('expired-token')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Kimlik doğrulaması gerekli.',
      status: 401,
    } satisfies Partial<ApiError>)
  })

  it('uses a stable error for a non-JSON API failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('upstream error', { status: 500 }))

    await expect(getCurrentUser('signed-token')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'İstek tamamlanamadı.',
      status: 500,
    })
  })

  it('does not hide network failures', async () => {
    const networkError = new TypeError('Failed to fetch')
    vi.mocked(fetch).mockRejectedValueOnce(networkError)

    await expect(getCurrentUser('signed-token')).rejects.toBe(networkError)
  })
})

describe('storefront API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('sends the bearer token to the protected home endpoint', async () => {
    const body = { message: 'Welcome', featured_categories: ['Home'] }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))

    await expect(getHome('signed-token')).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/home',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer signed-token',
        },
      }),
    )
  })

  it('sends the bearer token and pagination to the product listing endpoint', async () => {
    const body = {
      products: [
        apiTestProduct,
      ],
      total: 1,
      limit: 10,
      offset: 5,
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))

    await expect(getProducts('signed-token', 10, 5)).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products?limit=10&offset=5',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer signed-token',
        },
      }),
    )
  })

  it('sends catalog search, price, category, and sort filters', async () => {
    const body = { products: [], total: 0, limit: 20, offset: 0 }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))

    await expect(
      getProducts('signed-token', 20, 0, {
        search: 'Lavanta kremi',
        category: 'Kişisel Bakım',
        min_price: '100',
        max_price: '250',
        sort: 'price_asc',
      }),
    ).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products?limit=20&offset=0&search=Lavanta+kremi&category=Ki%C5%9Fisel+Bak%C4%B1m&min_price=100&max_price=250&sort=price_asc',
      expect.any(Object),
    )
  })

  it('omits empty catalog filters from the listing URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ products: [], total: 0, limit: 20, offset: 0 }),
    )

    await getProducts('signed-token', 20, 0, {
      search: '',
      category: '',
      min_price: '',
      max_price: '',
      sort: undefined,
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products?limit=20&offset=0',
      expect.any(Object),
    )
  })

  it('uses the default page size and offset for product listing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ products: [], total: 0, limit: 20, offset: 0 }),
    )

    await expect(getProducts('signed-token')).resolves.toEqual({
      products: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products?limit=20&offset=0',
      expect.any(Object),
    )
  })

  it('loads the signed-in buyer cart with an authorization header', async () => {
    const cart = { items: [], subtotal: '0.00' }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(cart))

    await expect(getMyCart('buyer-token')).resolves.toEqual(cart)
    expect(fetch).toHaveBeenCalledWith('/api/v1/cart', expect.any(Object))
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toHaveProperty('Authorization')
  })

  it('adds and updates cart quantities', async () => {
    const cart = { items: [], subtotal: '0.00' }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(cart))
      .mockResolvedValueOnce(jsonResponse(cart))

    await expect(
      addCartItem('buyer-token', { product_id: 42, quantity: 2 }),
    ).resolves.toEqual(cart)
    await expect(
      updateCartItem('buyer-token', 7, { quantity: 3 }),
    ).resolves.toEqual(cart)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/cart/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ product_id: 42, quantity: 2 }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/cart/items/7',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ quantity: 3 }),
      }),
    )
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.headers).toHaveProperty('Authorization')
    }
  })

  it('removes a cart item and accepts the empty response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deleteCartItem('buyer-token', 7)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/cart/items/7',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toHaveProperty('Authorization')
  })

  it('creates an order with address and delivery selection but no client-supplied prices', async () => {
    const order = {
      id: 44,
      status: 'pending_payment' as const,
      item_subtotal: '25.00',
      total_amount: '74.90',
      shipping_address: null,
      delivery_method: 'standard' as const,
      delivery_fee: '49.90',
      created_at: '2026-11-04T20:00:00Z',
      items: [],
      history: [],
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(order, 201))

    await expect(createOrder('buyer-token', 'retry-safe-key', {
      address_id: 8,
      delivery_method: 'standard',
    })).resolves.toEqual(order)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/orders',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer buyer-token',
          'Idempotency-Key': 'retry-safe-key',
        },
      }),
    )
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      address_id: 8,
      delivery_method: 'standard',
    }))
  })

  it('loads and manages buyer addresses with the bearer token', async () => {
    const address = {
      id: 8,
      label: 'Ev',
      recipient_name: 'Ada Buyer',
      phone: '+905551234567',
      city: 'Istanbul',
      district: 'Kadikoy',
      address_line: 'Example Street 1',
      postal_code: null,
      is_default: true,
      created_at: '2026-11-04T20:00:00Z',
      updated_at: '2026-11-04T20:00:00Z',
    }
    const requestBody = {
      label: 'Ev',
      recipient_name: 'Ada Buyer',
      phone: '+905551234567',
      city: 'Istanbul',
      district: 'Kadikoy',
      address_line: 'Example Street 1',
      postal_code: null,
      is_default: true,
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([address]))
      .mockResolvedValueOnce(jsonResponse(address, 201))
      .mockResolvedValueOnce(jsonResponse(address))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(getMyAddresses('buyer-token')).resolves.toEqual([address])
    await expect(createAddress('buyer-token', requestBody)).resolves.toEqual(address)
    await expect(updateAddress('buyer-token', address.id, requestBody)).resolves.toEqual(address)
    await expect(deleteAddress('buyer-token', address.id)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/addresses', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/addresses',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(requestBody) }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/addresses/8',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(requestBody) }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      '/api/v1/addresses/8',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('loads the buyer order history and a single order', async () => {
    const order = {
      id: 44,
      status: 'pending_payment' as const,
      total_amount: '25.00',
      created_at: '2026-11-04T20:00:00Z',
      items: [],
      history: [],
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([order]))
      .mockResolvedValueOnce(jsonResponse(order))

    await expect(getMyOrders('buyer-token')).resolves.toEqual([order])
    await expect(getMyOrder('buyer-token', order.id)).resolves.toEqual(order)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/orders',
      expect.any(Object),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/orders/44',
      expect.any(Object),
    )
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.headers).toHaveProperty('Authorization', 'Bearer buyer-token')
    }
  })

  it('starts a payment with an idempotency key and receives a hosted checkout URL', async () => {
    const payment = {
      id: 8,
      order_id: 44,
      provider_reference: 'mock-reference',
      status: 'pending' as const,
      amount: '25.00',
      currency: 'TRY',
      expires_at: '2026-11-04T20:02:00Z',
      checkout_url: '/api/v1/payments/mock-checkout/8/token',
      created_at: '2026-11-04T20:00:00Z',
      updated_at: '2026-11-04T20:00:00Z',
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payment, 201))

    await expect(
      createPayment('buyer-token', 44, 'order-44-payment'),
    ).resolves.toEqual(payment)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/orders/44/payments',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer buyer-token',
          'Idempotency-Key': 'order-44-payment',
        },
      }),
    )
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('loads admin orders and sends status and local refund operations', async () => {
    const order = {
      id: 44,
      owner_subject: 'buyer-subject',
      status: 'processing' as const,
      payment_status: 'succeeded' as const,
      total_amount: '25.00',
      created_at: '2026-11-04T20:00:00Z',
      items: [],
      history: [],
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([order]))
      .mockResolvedValueOnce(jsonResponse({ ...order, status: 'shipped' }))
      .mockResolvedValueOnce(jsonResponse({
        ...order,
        status: 'cancelled',
        payment_status: 'refunded',
      }))

    await expect(getAdminOrders('admin-token')).resolves.toEqual([order])
    await expect(
      updateAdminOrderStatus('admin-token', 44, 'shipped'),
    ).resolves.toMatchObject({ status: 'shipped' })
    await expect(
      refundAdminOrder('admin-token', 44, 'Alıcı talebi'),
    ).resolves.toMatchObject({ payment_status: 'refunded' })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/orders',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/orders/44/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'shipped' }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/admin/orders/44/refund',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Alıcı talebi' }),
      }),
    )
  })

  it('loads seller fulfillment orders and advances one fulfillment status', async () => {
    const order = {
      id: 21,
      order_id: 44,
      store_name: 'Sample Store',
      status: 'paid',
      created_at: '2026-11-04T20:00:00Z',
      updated_at: '2026-11-04T20:00:00Z',
      shipping_address: null,
      items: [],
      history: [],
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([order]))
      .mockResolvedValueOnce(jsonResponse({ ...order, status: 'processing' }))

    await expect(getSellerOrders('seller-token')).resolves.toEqual([order])
    await expect(
      updateSellerOrderStatus('seller-token', 21, 'processing'),
    ).resolves.toMatchObject({ status: 'processing' })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/seller/orders?limit=50&offset=0',
      expect.any(Object),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/seller/orders/21/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'processing' }),
      }),
    )
  })

  it('submits a product return with an idempotency key', async () => {
    const productReturn = {
      id: 5,
      order_item_id: 31,
      product_name: 'Liva krem',
      quantity: 1,
      reason: 'Ürün beklentimi karşılamadı',
      status: 'approved' as const,
      refund_amount: '12.50',
      created_at: '2026-11-06T12:00:00Z',
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(productReturn, 201))

    await expect(
      createProductReturn(
        'buyer-token',
        21,
        {
          order_item_id: 31,
          quantity: 1,
          reason: 'Ürün beklentimi karşılamadı',
        },
        'return-21-item-31',
      ),
    ).resolves.toEqual(productReturn)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/orders/21/returns',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer buyer-token',
          'Idempotency-Key': 'return-21-item-31',
        },
        body: JSON.stringify({
          order_item_id: 31,
          quantity: 1,
          reason: 'Ürün beklentimi karşılamadı',
        }),
      }),
    )
  })

  it('preserves product endpoint failures for the caller', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Kimlik doğrulaması gerekli.' }, 401),
    )

    await expect(getProducts('expired-token')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Kimlik doğrulaması gerekli.',
    } satisfies Partial<ApiError>)
  })

  it('creates a product with the admin bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(apiTestProduct, 201))

    await expect(
      createProduct('admin-token', apiTestProductRequest),
    ).resolves.toEqual(apiTestProduct)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify(apiTestProductRequest),
      }),
    )
  })

  it('preserves product creation failures for the form', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Bu işlem için yönetici yetkisi gereklidir.' }, 403),
    )

    await expect(
      createProduct('customer-token', {
        ...apiTestProductRequest,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    } satisfies Partial<ApiError>)
  })

  it('updates every product field using the admin bearer token', async () => {
    const updatedProduct = createTestProduct()
    const payload = productRequest(updatedProduct)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updatedProduct))

    await expect(
      updateProduct('admin-token', updatedProduct.id, payload),
    ).resolves.toEqual(updatedProduct)
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/products/${updatedProduct.id}`,
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify(payload),
      }),
    )
  })

  it('preserves product update failures for the form', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Ürün bulunamadı.' }, 404),
    )

    await expect(
      updateProduct('admin-token', 404, apiTestProductRequest),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Ürün bulunamadı.',
    } satisfies Partial<ApiError>)
  })

  it('deletes a product with the admin bearer token and accepts an empty response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deleteProduct('admin-token', apiTestProduct.id)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/products/${apiTestProduct.id}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
      }),
    )
  })

  it('preserves product deletion failures for the caller', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Bu işlem için yönetici yetkisi gereklidir.' }, 403),
    )

    await expect(
      deleteProduct('customer-token', apiTestProduct.id),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Bu işlem için yönetici yetkisi gereklidir.',
    } satisfies Partial<ApiError>)
  })

  it('creates a seller application draft with the authenticated buyer token', async () => {
    const body = { ...sellerApplicationRequest, id: 12, status: 'draft' }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body, 201))

    await expect(
      createSellerApplication('buyer-token', sellerApplicationRequest),
    ).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/seller-applications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('buyer-token'),
        }),
        body: JSON.stringify(sellerApplicationRequest),
      }),
    )
  })

  it('loads the buyer application and sends update/submit/withdraw requests', async () => {
    const application = { ...sellerApplicationRequest, id: 12, status: 'draft' }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(application))
      .mockResolvedValueOnce(jsonResponse(application))
      .mockResolvedValueOnce(jsonResponse({ ...application, status: 'submitted' }))
      .mockResolvedValueOnce(jsonResponse({ ...application, status: 'withdrawn' }))

    await expect(getMySellerApplication('buyer-token')).resolves.toEqual(application)
    await expect(
      updateMySellerApplication('buyer-token', sellerApplicationRequest),
    ).resolves.toEqual(application)
    await expect(submitMySellerApplication('buyer-token')).resolves.toMatchObject({
      status: 'submitted',
    })
    await expect(withdrawMySellerApplication('buyer-token')).resolves.toMatchObject({
      status: 'withdrawn',
    })

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/seller-applications/me',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/seller-applications/me/submit',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      '/api/v1/seller-applications/me/withdraw',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('loads seller applications and submits admin review decisions', async () => {
    const application = {
      ...sellerApplicationRequest,
      id: 12,
      status: 'under_review',
      owner_subject: 'buyer-subject',
      admin_note: null,
      reviewer_subject: 'admin-subject',
      reviewed_at: null,
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([application]))
      .mockResolvedValueOnce(jsonResponse({ ...application, status: 'approved' }))

    await expect(getSellerApplications('admin-token')).resolves.toEqual([application])
    await expect(
      reviewSellerApplication('admin-token', 12, {
        action: 'approve',
        admin_note: 'Reviewed',
      }),
    ).resolves.toMatchObject({ status: 'approved' })
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/seller-applications/12/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'approve', admin_note: 'Reviewed' }),
      }),
    )
  })
})
