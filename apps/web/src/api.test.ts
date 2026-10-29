import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getHome, getProducts, login } from './api'

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
})
