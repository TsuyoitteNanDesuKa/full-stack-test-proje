import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { getCurrentSession } from './auth'

vi.mock('./auth', () => ({
  beginLogin: vi.fn(),
  beginRegistration: vi.fn(),
  endSession: vi.fn(),
  getCurrentSession: vi.fn(),
}))

const productRecord = {
  id: 42,
  name: 'Detail product',
  category: 'Home',
  description: 'Detail description',
  price: '20.00',
  stock: 3,
  can_manage: false,
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
}

function stubBackend(productOverrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/v1/auth/me') {
      return Response.json({
        subject: 'buyer',
        email: 'buyer@example.com',
        roles: ['buyer'],
        is_admin: false,
      })
    }
    if (path === '/api/v1/home') return Response.json({ message: 'Welcome', featured_categories: [] })
    if (path === '/api/v1/cart') return Response.json({ items: [], subtotal: '0.00' })
    if (path === '/api/v1/addresses') return Response.json([])
    if (path === '/api/v1/seller-applications/me') return Response.json(null)
    if (path.startsWith('/api/v1/products?')) {
      return Response.json({ products: [{ ...productRecord, ...productOverrides }], total: 1, limit: 20, offset: 0 })
    }
    if (path === '/api/v1/products/42') {
      return Response.json({ ...productRecord, ...productOverrides })
    }
    if (path === '/api/v1/products/999') {
      return Response.json({ detail: 'Ürün bulunamadı.' }, { status: 404 })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

it('opens the product detail view from the catalog link without a full page reload', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  stubBackend()
  render(<App />)

  fireEvent.click(await screen.findByRole('link', { name: 'Detail product' }))

  expect(window.location.pathname).toBe('/products/42')
  expect(await screen.findByRole('heading', { name: 'Detail product', level: 1 })).toBeInTheDocument()
})

it('restores the detail view when the URL is opened directly', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  window.history.replaceState({}, '', '/products/42')
  stubBackend()

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Detail product', level: 1 })).toBeInTheDocument()
})

it('returns to the catalog and syncs with browser back navigation', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  stubBackend()
  render(<App />)

  fireEvent.click(await screen.findByRole('link', { name: 'Detail product' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Kataloğa dön' }))

  expect(window.location.pathname).toBe('/')
  expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()

  window.history.pushState({}, '', '/products/42')
  fireEvent.popState(window)

  expect(await screen.findByRole('heading', { name: 'Detail product', level: 1 })).toBeInTheDocument()
  await waitFor(() => expect(window.location.pathname).toBe('/products/42'))
})

it('adds the product to the cart from its detail page', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  const fetchMock = stubBackend()
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/v1/cart/items' && init?.method === 'POST') {
      return Response.json({
        items: [
          {
            id: 7,
            product_id: 42,
            product_name: 'Detail product',
            unit_price: '20.00',
            quantity: 1,
            available_stock: 3,
            is_available: true,
            line_total: '20.00',
          },
        ],
        subtotal: '20.00',
      })
    }
    if (path === '/api/v1/auth/me') {
      return Response.json({ subject: 'buyer', email: 'buyer@example.com', roles: ['buyer'], is_admin: false })
    }
    if (path === '/api/v1/home') return Response.json({ message: 'Welcome', featured_categories: [] })
    if (path === '/api/v1/cart') return Response.json({ items: [], subtotal: '0.00' })
    if (path === '/api/v1/addresses') return Response.json([])
    if (path === '/api/v1/seller-applications/me') return Response.json(null)
    if (path === '/api/v1/products/42') return Response.json(productRecord)
    if (path.startsWith('/api/v1/products?')) {
      return Response.json({ products: [productRecord], total: 1, limit: 20, offset: 0 })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  window.history.replaceState({}, '', '/products/42')

  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sepete ekle' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/cart/items',
      expect.objectContaining({ method: 'POST' }),
    ),
  )
})

it('ignores an invalid product id in the URL and shows the catalog', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  window.history.replaceState({}, '', '/products/0')
  stubBackend()

  render(<App />)

  expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Detail product', level: 1 })).not.toBeInTheDocument()
})

it('shows the not-found message for a missing product URL', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({ accessToken: 'buyer-token', email: 'buyer@example.com' })
  window.history.replaceState({}, '', '/products/999')
  stubBackend()

  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent('Ürün bulunamadı.')
})
