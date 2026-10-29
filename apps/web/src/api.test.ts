import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createProduct, getHome, getProducts, login, updateProduct } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('login API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('sends the login payload as JSON and returns the token response', async () => {
    const body = {
      access_token: 'signed-token',
      token_type: 'bearer' as const,
      expires_in: 1800,
      is_admin: false,
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))

    await expect(login('customer@example.com', 'correct-password')).resolves.toEqual(body)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'correct-password',
        }),
      }),
    )
  })

  it('preserves API error status and detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Geçersiz e-posta veya parola.' }, 401),
    )

    await expect(login('customer@example.com', 'wrong-password')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Geçersiz e-posta veya parola.',
      status: 401,
    } satisfies Partial<ApiError>)
  })

  it('uses a stable error for a non-JSON API failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('upstream error', { status: 500 }))

    await expect(login('customer@example.com', 'password')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'İstek tamamlanamadı.',
      status: 500,
    })
  })

  it('does not hide network failures', async () => {
    const networkError = new TypeError('Failed to fetch')
    vi.mocked(fetch).mockRejectedValueOnce(networkError)

    await expect(login('customer@example.com', 'password')).rejects.toBe(networkError)
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
        {
          id: 1,
          name: 'Lavanta El Kremi',
          category: 'Kişisel Bakım',
          description: 'Nemlendirici el kremi.',
          price: '129.90',
          stock: 24,
          updated_at: null,
        },
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
    const product = {
      id: 8,
      name: 'Yeni Ürün',
      category: 'Ev ve Yaşam',
      description: 'El yapımı dekoratif ürün.',
      price: '299.90',
      stock: 7,
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(product, 201))

    await expect(
      createProduct('admin-token', {
        name: 'Yeni Ürün',
        category: 'Ev ve Yaşam',
        description: 'El yapımı dekoratif ürün.',
        price: '299.90',
        stock: 7,
      }),
    ).resolves.toEqual(product)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-token',
        },
        body: JSON.stringify({
          name: 'Yeni Ürün',
          category: 'Ev ve Yaşam',
          description: 'El yapımı dekoratif ürün.',
          price: '299.90',
          stock: 7,
        }),
      }),
    )
  })

  it('preserves product creation failures for the form', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Bu işlem için yönetici yetkisi gereklidir.' }, 403),
    )

    await expect(
      createProduct('customer-token', {
        name: 'Yeni Ürün',
        category: 'Ev ve Yaşam',
        description: 'Ürün açıklaması.',
        price: '29.90',
        stock: 1,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    } satisfies Partial<ApiError>)
  })

  it('updates every product field using the admin bearer token', async () => {
    const updatedProduct = {
      id: 8,
      name: 'Değiştirilen Ürün',
      category: 'Ev ve Yaşam',
      description: 'Güncellenmiş ürün açıklaması.',
      price: '349.90',
      stock: 11,
      updated_at: '2026-10-29T10:00:00',
    }
    const payload = {
      name: 'Değiştirilen Ürün',
      category: 'Ev ve Yaşam',
      description: 'Güncellenmiş ürün açıklaması.',
      price: '349.90',
      stock: 11,
    }
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updatedProduct))

    await expect(updateProduct('admin-token', 8, payload)).resolves.toEqual(updatedProduct)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products/8',
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
      updateProduct('admin-token', 404, {
        name: 'Yeni Ürün',
        category: 'Ev ve Yaşam',
        description: 'Ürün açıklaması.',
        price: '29.90',
        stock: 1,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Ürün bulunamadı.',
    } satisfies Partial<ApiError>)
  })
})
