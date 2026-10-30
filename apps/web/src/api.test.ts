import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createProduct,
  deleteProduct,
  getCurrentUser,
  getHome,
  getProducts,
  updateProduct,
} from './api'
import { createTestProduct, productRequest } from './test/testData'

const apiTestProduct = createTestProduct()
const apiTestProductRequest = productRequest(apiTestProduct)

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
})
