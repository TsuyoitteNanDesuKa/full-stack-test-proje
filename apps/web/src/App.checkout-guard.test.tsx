import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type CartPanel from './CartPanel'
import App from './App'
import { getCurrentSession } from './auth'

vi.mock('./auth', () => ({
  beginLogin: vi.fn(),
  beginRegistration: vi.fn(),
  endSession: vi.fn(),
  getCurrentSession: vi.fn(),
}))

vi.mock('./CartPanel', () => ({
  default: ({ onCheckout, error }: ComponentProps<typeof CartPanel>) => (
    <div>
      <button onClick={() => void onCheckout()} type="button">Force checkout</button>
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}))

it('rejects a checkout callback when no address is selected', async () => {
  vi.mocked(getCurrentSession).mockResolvedValue({
    accessToken: 'buyer-token',
    email: 'buyer@example.com',
  })
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    const bodies: Record<string, unknown> = {
      '/api/v1/auth/me': {
        subject: 'buyer',
        email: 'buyer@example.com',
        roles: ['buyer'],
        is_admin: false,
      },
      '/api/v1/home': { message: 'Welcome', featured_categories: [] },
      '/api/v1/cart': { items: [], subtotal: '0.00' },
      '/api/v1/addresses': [],
      '/api/v1/seller-applications/me': null,
    }
    if (path.startsWith('/api/v1/products?')) {
      return Response.json({ products: [], total: 0, limit: 20, offset: 0 })
    }
    if (!(path in bodies)) throw new Error(`Unexpected request: ${path}`)
    return Response.json(bodies[path])
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Force checkout' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'önce bir teslimat adresi ekle veya seç',
  )
  await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
    String(input) === '/api/v1/orders',
  )).toBe(false))
})
