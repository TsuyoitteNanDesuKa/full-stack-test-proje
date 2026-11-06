import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type {
  AdminSellerApplication,
  CartItem,
  CartResponse,
  CustomerOrder,
  Product,
} from './api'
import { createTestProduct, productRequest } from './test/testData'
import { beginLogin, beginRegistration, endSession, getCurrentSession } from './auth'
import type { AuthSession } from './auth'

vi.mock('./auth', () => ({
  beginLogin: vi.fn(),
  beginRegistration: vi.fn(),
  endSession: vi.fn(),
  getCurrentSession: vi.fn(),
}))

const customerSession: AuthSession = {
  accessToken: 'buyer-token',
  email: 'customer@example.com',
}
const adminSession: AuthSession = {
  accessToken: 'admin-token',
  email: 'admin@example.com',
}
const sampleProduct: Product = createTestProduct()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function productList(products: Product[] = [sampleProduct]) {
  return { products, total: products.length, limit: 20, offset: 0 }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setupApi(options: {
  isAdmin?: boolean
  isSeller?: boolean
  buyerRole?: boolean
  email?: string
  products?: Product[]
  cart?: CartResponse
  orders?: CustomerOrder[]
  sellerApplications?: AdminSellerApplication[]
  homeError?: Response
  deleteError?: Response
  orderFailure?: Response | Error
} = {}) {
  const fetchMock = vi.mocked(fetch)
  let sellerApplication: Record<string, unknown> | null = null
  let sellerApplications = options.sellerApplications ?? []
  let cart: CartResponse = options.cart ?? { items: [], subtotal: '0.00' }
  const orders = options.orders ?? []
  const ordersByIdempotencyKey = new Map<string, CustomerOrder>()
  let orderFailure = options.orderFailure
  fetchMock.mockImplementation(async (input, init) => {
    const path = String(input)
    if (path === '/api/v1/auth/me') {
      return jsonResponse({
        subject: 'keycloak-user',
        email: options.email ?? 'customer@example.com',
        roles: [
          ...(options.isAdmin ? ['admin'] : []),
          ...(options.buyerRole === false ? [] : ['buyer']),
          ...(options.isSeller ? ['seller'] : []),
        ],
        is_admin: options.isAdmin ?? false,
      })
    }
    if (path === '/api/v1/home') {
      return options.homeError ?? jsonResponse({
        message: 'Alışverişe hoş geldiniz',
        featured_categories: [],
      })
    }
    if (path === '/api/v1/cart' && init?.method !== 'POST') {
      return jsonResponse(cart)
    }
    if (path === '/api/v1/cart/items' && init?.method === 'POST') {
      const request = JSON.parse(String(init.body)) as {
        product_id: number
        quantity: number
      }
      const product = (options.products ?? [sampleProduct]).find(
        (item) => item.id === request.product_id,
      )
      if (!product) return jsonResponse({ detail: 'Ürün bulunamadı.' }, 404)
      const existing = cart.items.find((item) => item.product_id === product.id)
      const quantity = (existing?.quantity ?? 0) + request.quantity
      const cartItem: CartItem = {
        id: existing?.id ?? 901,
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity,
        available_stock: product.stock,
        is_available: quantity <= product.stock,
        line_total: quantity <= product.stock
          ? (Number(product.price) * quantity).toFixed(2)
          : null,
      }
      cart = {
        items: existing
          ? cart.items.map((item) => item.id === existing.id ? cartItem : item)
          : [...cart.items, cartItem],
        subtotal: quantity <= product.stock
          ? (
              Number(cart.subtotal) -
              (existing?.line_total ? Number(existing.line_total) : 0) +
              Number(product.price) * quantity
            ).toFixed(2)
          : cart.subtotal,
      }
      return jsonResponse(cart)
    }
    if (path === '/api/v1/orders' && init?.method === 'POST') {
      if (orderFailure) {
        const failure = orderFailure
        orderFailure = undefined
        if (failure instanceof Error) throw failure
        return failure
      }
      const key = new Headers(init.headers).get('Idempotency-Key')
      if (!key) return jsonResponse({ detail: 'Missing idempotency key' }, 422)
      const existingOrder = ordersByIdempotencyKey.get(key)
      if (existingOrder) return jsonResponse(existingOrder, 200)
      if (cart.items.length === 0) {
        return jsonResponse({ detail: 'Empty cart' }, 409)
      }
      const items = cart.items.map((item, index) => ({
        id: index + 1,
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price ?? '0.00',
        quantity: item.quantity,
        line_total: item.line_total ?? '0.00',
      }))
      const order: CustomerOrder = {
        id: orders.length + ordersByIdempotencyKey.size + 1,
        status: 'pending_payment',
        total_amount: cart.subtotal,
        created_at: new Date().toISOString(),
        items,
        history: [],
      }
      ordersByIdempotencyKey.set(key, order)
      orders.unshift(order)
      cart = { items: [], subtotal: '0.00' }
      return jsonResponse(order, 201)
    }
    if (path === '/api/v1/orders') return jsonResponse(orders)
    if (/^\/api\/v1\/orders\/\d+$/.test(path)) {
      const orderId = Number(path.split('/').at(-1))
      const order = orders.find((item) => item.id === orderId)
      return order ? jsonResponse(order) : jsonResponse({ detail: 'not found' }, 404)
    }
    if (path === '/api/v1/admin/orders') return jsonResponse([])
    if (/^\/api\/v1\/cart\/items\/\d+$/.test(path) && init?.method === 'PUT') {
      const itemId = Number(path.split('/').at(-1))
      const request = JSON.parse(String(init.body)) as { quantity: number }
      cart = {
        items: cart.items.map((item) => {
          if (item.id !== itemId) return item
          const lineTotal = item.unit_price === null
            ? null
            : (Number(item.unit_price) * request.quantity).toFixed(2)
          return {
            ...item,
            quantity: request.quantity,
            line_total: lineTotal,
            is_available: item.available_stock !== null &&
              request.quantity <= item.available_stock,
          }
        }),
        subtotal: cart.items
          .map((item) => {
            if (item.id !== itemId) {
              return item.is_available ? Number(item.line_total ?? 0) : 0
            }
            return item.available_stock !== null &&
              request.quantity <= item.available_stock &&
              item.unit_price !== null
              ? Number(item.unit_price) * request.quantity
              : 0
          })
          .reduce((total, line) => total + line, 0)
          .toFixed(2),
      }
      return jsonResponse(cart)
    }
    if (/^\/api\/v1\/cart\/items\/\d+$/.test(path) && init?.method === 'DELETE') {
      const itemId = Number(path.split('/').at(-1))
      cart = {
        items: cart.items.filter((item) => item.id !== itemId),
        subtotal: cart.items
          .filter((item) => item.id !== itemId && item.is_available)
          .reduce((total, item) => total + Number(item.line_total ?? 0), 0)
          .toFixed(2),
      }
      return new Response(null, { status: 204 })
    }
    if (path === '/api/v1/seller-applications/me' && init?.method === 'PUT') {
      sellerApplication = {
        ...JSON.parse(String(init.body)),
        id: 501,
        status: 'draft',
        applicant_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return jsonResponse(sellerApplication)
    }
    if (path === '/api/v1/seller-applications/me') {
      return jsonResponse(sellerApplication)
    }
    if (path === '/api/v1/seller-applications' && init?.method === 'POST') {
      sellerApplication = {
        ...JSON.parse(String(init.body)),
        id: 501,
        status: 'draft',
        applicant_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return jsonResponse(sellerApplication, 201)
    }
    if (path === '/api/v1/seller-applications/me/submit') {
      sellerApplication = { ...sellerApplication, status: 'submitted' }
      return jsonResponse(sellerApplication)
    }
    if (path === '/api/v1/seller-applications/me/withdraw') {
      sellerApplication = { ...sellerApplication, status: 'withdrawn' }
      return jsonResponse(sellerApplication)
    }
    if (path === '/api/v1/seller-applications') {
      return jsonResponse(sellerApplications)
    }
    if (/^\/api\/v1\/seller-applications\/\d+\/review$/.test(path)) {
      const applicationId = Number(path.split('/')[4])
      const current = sellerApplications.find((item) => item.id === applicationId)
      if (!current) return jsonResponse({ detail: 'not found' }, 404)
      const review = JSON.parse(String(init?.body)) as {
        action: string
      }
      const nextStatus =
        review.action === 'begin_review'
          ? 'under_review'
          : review.action === 'approve'
            ? 'approved'
            : review.action === 'reject'
              ? 'rejected'
              : 'changes_requested'
      const updated = { ...current, status: nextStatus as AdminSellerApplication['status'] }
      sellerApplications = sellerApplications.map((item) =>
        item.id === applicationId ? updated : item,
      )
      return jsonResponse(updated)
    }
    if (path.startsWith('/api/v1/products?')) {
      return jsonResponse(productList(options.products))
    }
    if (path === '/api/v1/products' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as Product
      return jsonResponse({
        ...payload,
        id: 700,
        can_manage: options.isAdmin === true || options.isSeller === true,
      }, 201)
    }
    const productId = Number(path.split('/').at(-1))
    if (path.endsWith(`/${productId}`) && init?.method === 'PUT') {
      const payload = JSON.parse(String(init.body)) as Product
      return jsonResponse({
        ...payload,
        id: productId,
        updated_at: new Date().toISOString(),
      })
    }
    if (path.endsWith(`/${productId}`) && init?.method === 'DELETE') {
      return options.deleteError ?? new Response(null, { status: 204 })
    }
    return jsonResponse({ detail: 'unexpected request' }, 500)
  })
}

function failCartRequest(path: string, failure: Response | Error) {
  const fetchMock = vi.mocked(fetch)
  const originalFetch = fetchMock.getMockImplementation()
  if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
  fetchMock.mockImplementation((input, init) => {
    if (String(input) === path) {
      return failure instanceof Error ? Promise.reject(failure) : Promise.resolve(failure)
    }
    return originalFetch(input, init)
  })
}

describe('Keycloak authentication and storefront', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(getCurrentSession).mockResolvedValue(customerSession)
    vi.mocked(beginLogin).mockResolvedValue()
    vi.mocked(beginRegistration).mockResolvedValue()
    vi.mocked(endSession).mockResolvedValue()
  })

  it('starts hosted login without collecting credentials locally', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /giriş yap/i }))

    expect(beginLogin).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('E-posta adresi')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Parola')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts Keycloak self-registration for a new buyer account', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /alıcı hesabı oluştur/i }))

    expect(beginRegistration).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows an error when the identity provider redirect cannot start', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    vi.mocked(beginLogin).mockRejectedValue(new Error('identity provider unavailable'))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kimlik sağlayıcısına bağlanılamadı.',
    )
  })

  it('loads the signed-in buyer identity and storefront using the OIDC access token', async () => {
    setupApi()
    const user = userEvent.setup()
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/customer@example.com olarak giriş yaptın/)).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Ürün ekle' })).not.toBeInTheDocument()
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer buyer-token' }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/home',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer buyer-token' }),
      }),
    )

    await user.click(screen.getByRole('button', { name: /çıkış yap/i }))
    expect(endSession).toHaveBeenCalledOnce()
  })

  it('uses the email from the OIDC session when the profile has no email', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: 'buyer-token',
      email: 'fallback@example.com',
    })
    setupApi({ email: '' })
    render(<App />)

    expect(await screen.findByText(/fallback@example.com olarak giriş yaptın/)).toBeInTheDocument()
  })

  it('lets a buyer add a product, update quantity, and remove it from the cart', async () => {
    const product = createTestProduct({ stock: 5, price: '12.50' })
    setupApi({ products: [product] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', {
      name: `Sepete ekle ${product.name}`,
    }))
    expect(await screen.findByRole('heading', { name: 'Sepetim' })).toBeInTheDocument()
    expect(screen.getByText('Sepet (1)')).toBeInTheDocument()
    const quantity = screen.getByRole('spinbutton', { name: `Miktar: ${product.name}` })
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Miktarı güncelle' }))
    expect(await screen.findByText(/37,50/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sepetten kaldır' }))
    expect(await screen.findByText('Sepetin henüz boş.')).toBeInTheDocument()
    expect(screen.getByText('Sepet (0)')).toBeInTheDocument()
  })

  it('creates an order, empties the cart, and displays the order in history', async () => {
    const product = createTestProduct({ id: 881, stock: 5, price: '12.50' })
    setupApi({
      products: [product],
      cart: {
        items: [{
          id: 882,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 2,
          available_stock: product.stock,
          is_available: true,
          line_total: '25.00',
        }],
        subtotal: '25.00',
      },
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (2)' }))
    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Siparişin oluşturuldu: #1. Ödeme adımı bekleniyor.',
    )
    expect(screen.getByText('Sepetin henüz boş.')).toBeInTheDocument()
    const checkoutRequest = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input) === '/api/v1/orders',
    )
    expect(checkoutRequest?.[1]?.method).toBe('POST')
    const checkoutHeaders = new Headers(checkoutRequest?.[1]?.headers)
    expect(checkoutHeaders.has('Authorization')).toBe(true)
    expect(checkoutHeaders.get('Idempotency-Key')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    expect(await screen.findByRole('heading', { name: 'Sipariş #1' })).toBeInTheDocument()
    expect(screen.getByText(`${product.name} · 2 adet · ₺25,00`)).toBeInTheDocument()
  })

  it('retries a network-failed checkout with the same idempotency key', async () => {
    const product = createTestProduct({ id: 883, stock: 3 })
    setupApi({
      products: [product],
      cart: {
        items: [{
          id: 884,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 1,
          available_stock: product.stock,
          is_available: true,
          line_total: product.price,
        }],
        subtotal: product.price,
      },
      orderFailure: new TypeError('Network unavailable'),
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (1)' }))
    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aynı istekle tekrar deneyebilirsin.',
    )
    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Siparişin oluşturuldu: #1.')
    const checkoutRequests = vi.mocked(fetch).mock.calls.filter(([input]) =>
      String(input) === '/api/v1/orders',
    )
    expect(checkoutRequests).toHaveLength(2)
    const firstKey = new Headers(checkoutRequests[0]?.[1]?.headers).get('Idempotency-Key')
    const retryKey = new Headers(checkoutRequests[1]?.[1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(retryKey).toBe(firstKey)
  })

  it.each([
    {
      failure: jsonResponse({ detail: 'Cart changed' }, 409),
      message: 'Sepetindeki ürün veya stok değişti.',
      title: 'stale carts',
    },
    {
      failure: jsonResponse({ detail: 'Session expired' }, 401),
      message: 'Oturum süren dolmuş.',
      title: 'expired sessions',
    },
    {
      failure: jsonResponse({ detail: 'Unexpected error' }, 500),
      message: 'Sipariş oluşturulamadı.',
      title: 'unexpected API errors',
    },
  ])('shows a useful checkout error for $title', async ({ failure, message }) => {
    const product = createTestProduct({ id: 885, stock: 2 })
    setupApi({
      products: [product],
      cart: {
        items: [{
          id: 886,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 1,
          available_stock: product.stock,
          is_available: true,
          line_total: product.price,
        }],
        subtotal: product.price,
      },
      orderFailure: failure,
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (1)' }))
    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('surfaces cart-refresh failures after a checkout conflict', async () => {
    const product = createTestProduct({ id: 887, stock: 2 })
    setupApi({
      products: [product],
      cart: {
        items: [{
          id: 888,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: 1,
          available_stock: product.stock,
          is_available: true,
          line_total: product.price,
        }],
        subtotal: product.price,
      },
      orderFailure: jsonResponse({ detail: 'Cart changed' }, 409),
    })
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()
    if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
    let cartRequests = 0
    fetchMock.mockImplementation((input, init) => {
      if (String(input) === '/api/v1/cart' && ++cartRequests === 2) {
        return Promise.reject(new TypeError('Network unavailable'))
      }
      return originalFetch(input, init)
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (1)' }))
    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sepetindeki ürün veya stok değişti.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Sunucuya bağlanılamadı.')
  })

  it('retries after the cart request fails', async () => {
    setupApi()
    let shouldFail = true
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()
    if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
    fetchMock.mockImplementation((input, init) => {
      if (String(input) === '/api/v1/cart' && shouldFail) {
        return Promise.reject(new TypeError('Network unavailable'))
      }
      return originalFetch(input, init)
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (0)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sepet yüklenemedi.')
    shouldFail = false
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(await screen.findByText('Sepetin henüz boş.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not update state when a pending cart response resolves after unmount', async () => {
    setupApi()
    const pendingCart = deferred<Response>()
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()
    if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
    fetchMock.mockImplementation((input, init) => (
      String(input) === '/api/v1/cart' ? pendingCart.promise : originalFetch(input, init)
    ))
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: 'Sepet (0)' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/cart',
      expect.anything(),
    ))

    unmount()
    await act(async () => {
      pendingCart.resolve(jsonResponse({ items: [], subtotal: '0.00' }))
      await pendingCart.promise
    })
  })

  it('does not update state when a pending cart request rejects after unmount', async () => {
    setupApi()
    const pendingCart = deferred<Response>()
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()
    if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
    fetchMock.mockImplementation((input, init) => (
      String(input) === '/api/v1/cart' ? pendingCart.promise : originalFetch(input, init)
    ))
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: 'Sepet (0)' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/cart',
      expect.anything(),
    ))

    unmount()
    await act(async () => {
      pendingCart.reject(new Error('Network unavailable'))
      await pendingCart.promise.catch(() => undefined)
    })
  })

  it('shows unavailable stock without allowing the buyer to add the product', async () => {
    const outOfStockProduct = createTestProduct({ stock: 0 })
    setupApi({ products: [outOfStockProduct] })
    render(<App />)

    const addButton = await screen.findByRole('button', {
      name: `Sepete ekle ${outOfStockProduct.name}`,
    })
    expect(addButton).toBeDisabled()
    expect(addButton).toHaveTextContent('Stokta yok')
  })

  it.each([
    {
      failure: new TypeError('Network unavailable'),
      message: 'Sunucuya bağlanılamadı. Sepet işlemi tamamlanamadı.',
      title: 'network errors',
    },
    {
      failure: jsonResponse({ detail: 'Stock conflict' }, 409),
      message: 'İstenen miktar mevcut stoktan fazla.',
      title: 'stock conflicts',
    },
    {
      failure: jsonResponse({ detail: 'Unexpected error' }, 500),
      message: 'Sepet işlemi tamamlanamadı. Lütfen tekrar dene.',
      title: 'unexpected API errors',
    },
  ])('shows a useful cart-add error for $title', async ({ failure, message }) => {
    const product = createTestProduct({ stock: 3 })
    setupApi({ products: [product] })
    failCartRequest('/api/v1/cart/items', failure)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', {
      name: `Sepete ekle ${product.name}`,
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('shows authentication and missing-item errors for cart update and removal', async () => {
    const product = createTestProduct({ id: 871, stock: 4, price: '12.50' })
    const cartItem = {
      id: 872,
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity: 1,
      available_stock: product.stock,
      is_available: true,
      line_total: product.price,
    }
    setupApi({
      products: [product],
      cart: { items: [cartItem], subtotal: product.price },
    })
    let failure = jsonResponse({ detail: 'Item not found' }, 404)
    const fetchMock = vi.mocked(fetch)
    const originalFetch = fetchMock.getMockImplementation()
    if (!originalFetch) throw new Error('Expected the storefront API mock to be configured.')
    fetchMock.mockImplementation((input, init) => {
      if (String(input) === `/api/v1/cart/items/${cartItem.id}`) {
        return Promise.resolve(failure)
      }
      return originalFetch(input, init)
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sepet (1)' }))
    await user.click(screen.getByRole('button', { name: 'Miktarı güncelle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ürün veya sepet satırı')
    failure = jsonResponse({ detail: 'Session expired' }, 401)
    await user.click(screen.getByRole('button', { name: 'Sepetten kaldır' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Oturum süren dolmuş.')
  })

  it('uses a generic account label when neither source provides an email', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: 'buyer-token',
      email: '',
    })

    setupApi({ email: '' })
    render(<App />)

    expect(await screen.findByText(/Hesabın olarak giriş yaptın/)).toBeInTheDocument()
  })

  it('lets a buyer submit a seller application and shows its review status', async () => {
    setupApi()
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Satıcı olarak başvur' }))
    await user.type(await screen.findByLabelText('Yasal ad / unvan'), 'Enes Aysel')
    await user.type(screen.getByLabelText('Mağaza adı'), 'Liva Botanicals')
    await user.type(screen.getByLabelText('İletişim telefonu'), '05551234567')
    await user.type(screen.getByLabelText('İl'), 'İstanbul')
    await user.type(screen.getByLabelText('İlçe'), 'Kadıköy')
    await user.type(screen.getByLabelText('Ana ürün kategorisi'), 'Kişisel bakım')
    await user.type(
      screen.getByLabelText('İşletme / mağaza açıklaması'),
      'Doğal bakım ürünleri',
    )
    await user.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }))

    expect(await screen.findByText('Gönderildi')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/seller-applications/me/submit',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('lets a buyer withdraw an editable application', async () => {
    setupApi()
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Satıcı olarak başvur' }))
    await user.type(await screen.findByLabelText('Yasal ad / unvan'), 'Enes Aysel')
    await user.type(screen.getByLabelText('Mağaza adı'), 'Liva Botanicals')
    await user.type(screen.getByLabelText('İletişim telefonu'), '+905551234567')
    await user.type(screen.getByLabelText('İl'), 'İstanbul')
    await user.type(screen.getByLabelText('İlçe'), 'Kadıköy')
    await user.type(screen.getByLabelText('Ana ürün kategorisi'), 'Kişisel bakım')
    await user.type(
      screen.getByLabelText('İşletme / mağaza açıklaması'),
      'Doğal bakım ürünleri için yerel mağaza.',
    )
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }))
    await user.click(await screen.findByRole('button', { name: 'Başvuruyu geri çek' }))

    expect(await screen.findByText('Geri çekildi')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/seller-applications/me/withdraw',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows a safe error if session restoration fails', async () => {
    vi.mocked(getCurrentSession).mockRejectedValue(new Error('callback failed'))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Oturum başlatılamadı.')
  })

  it('shows the signed-out screen when no active session exists', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /giriş yap/i })).toBeInTheDocument()
  })

  it('shows a safe error when the API rejects a restored session', async () => {
    setupApi({ homeError: jsonResponse({ detail: 'internal error' }, 401) })
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Oturum başlatılamadı.')
  })

  it('renders catalog loading and empty states, then retries a failed request', async () => {
    const fetchMock = vi.mocked(fetch)
    let productCalls = 0
    fetchMock.mockImplementation(async (input) => {
      const path = String(input)
      if (path === '/api/v1/auth/me') {
        return jsonResponse({
          subject: 'keycloak-user',
          email: 'customer@example.com',
          roles: ['buyer'],
          is_admin: false,
        })
      }
      if (path === '/api/v1/home') {
        return jsonResponse({ message: 'Welcome', featured_categories: [] })
      }
      if (path === '/api/v1/seller-applications/me') {
        return jsonResponse(null)
      }
      if (path.startsWith('/api/v1/products?')) {
        productCalls += 1
        return productCalls === 1
          ? jsonResponse({ detail: 'failed' }, 500)
          : jsonResponse(productList([]))
      }
      return jsonResponse({}, 500)
    })
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ürünler yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Henüz listelenecek ürün yok.')).toBeInTheDocument()
    expect(productCalls).toBe(2)
  })

  it('submits catalog filters and rejects an inverted price range locally', async () => {
    setupApi({ products: [sampleProduct] })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('row', { name: new RegExp(sampleProduct.name, 'i') })

    await user.type(screen.getByRole('searchbox', { name: 'Ürün ara' }), 'Lavanta')
    await user.type(screen.getByRole('textbox', { name: 'Kategori' }), 'Kişisel Bakım')
    await user.type(screen.getByRole('spinbutton', { name: 'En düşük fiyat' }), '100')
    await user.type(screen.getByRole('spinbutton', { name: 'En yüksek fiyat' }), '250')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sırala' }), 'price_asc')
    await user.click(screen.getByRole('button', { name: 'Filtrele' }))

    await waitFor(() => {
      const request = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .find((url) => {
          if (!url.startsWith('/api/v1/products?')) return false
          return new URLSearchParams(url.split('?')[1]).has('search')
        })
      expect(request).toBeDefined()
      const query = new URLSearchParams(request?.split('?')[1])
      expect(query.get('search')).toBe('Lavanta')
      expect(query.get('category')).toBe('Kişisel Bakım')
      expect(query.get('min_price')).toBe('100')
      expect(query.get('max_price')).toBe('250')
      expect(query.get('sort')).toBe('price_asc')
    })

    const productRequests = vi.mocked(fetch).mock.calls.filter(([input]) =>
      String(input).startsWith('/api/v1/products?'),
    )
    await user.clear(screen.getByRole('spinbutton', { name: 'En düşük fiyat' }))
    await user.type(screen.getByRole('spinbutton', { name: 'En düşük fiyat' }), '300')
    await user.click(screen.getByRole('button', { name: 'Filtrele' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Minimum fiyat maksimum fiyattan büyük olamaz.',
    )
    expect(
      vi.mocked(fetch).mock.calls.filter(([input]) =>
        String(input).startsWith('/api/v1/products?'),
      ),
    ).toHaveLength(productRequests.length)
  })

  it('shows a dedicated empty state when catalog filters find no products', async () => {
    setupApi({ products: [] })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Henüz listelenecek ürün yok.')

    await user.type(screen.getByRole('searchbox', { name: 'Ürün ara' }), 'not-found')
    await user.click(screen.getByRole('button', { name: 'Filtrele' }))

    expect(await screen.findByText('Bu filtrelerle ürün bulunamadı.')).toBeInTheDocument()
  })

  it('ignores a catalog response that arrives after the storefront unmounts', async () => {
    const productsResponse = deferred<Response>()
    setupApi()
    const previousFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) =>
      String(input).startsWith('/api/v1/products?')
        ? productsResponse.promise
        : previousFetch(input, init),
    )
    const { unmount } = render(<App />)

    await screen.findByText('Ürünler yükleniyor...')
    unmount()
    await act(async () => {
      productsResponse.resolve(jsonResponse(productList()))
      await productsResponse.promise
    })
  })

  it('ignores a catalog failure that arrives after the storefront unmounts', async () => {
    const productsResponse = deferred<Response>()
    setupApi()
    const previousFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) =>
      String(input).startsWith('/api/v1/products?')
        ? productsResponse.promise
        : previousFetch(input, init),
    )
    const { unmount } = render(<App />)

    await screen.findByText('Ürünler yükleniyor...')
    unmount()
    await act(async () => {
      productsResponse.reject(new Error('catalog failed'))
      await productsResponse.promise.catch(() => undefined)
    })
  })

  it('does not update session state when initialization completes after unmount', async () => {
    const session = deferred<AuthSession | null>()
    vi.mocked(getCurrentSession).mockReturnValue(session.promise)
    setupApi()
    const { unmount } = render(<App />)

    unmount()
    await act(async () => {
      session.resolve(customerSession)
      await session.promise
    })
  })

  it('does not update session state when initialization fails after unmount', async () => {
    const session = deferred<AuthSession | null>()
    vi.mocked(getCurrentSession).mockReturnValue(session.promise)
    const { unmount } = render(<App />)

    unmount()
    await act(async () => {
      session.reject(new Error('session failed'))
      await session.promise.catch(() => undefined)
    })
  })

  it('shows a connection-specific message when the catalog cannot be reached', async () => {
    setupApi()
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).startsWith('/api/v1/products?')) {
        throw new TypeError('network failure')
      }
      if (String(input) === '/api/v1/auth/me') {
        return jsonResponse({ email: 'customer@example.com', is_admin: false })
      }
      if (String(input) === '/api/v1/seller-applications/me') {
        return jsonResponse(null)
      }
      return jsonResponse({ message: 'Welcome', featured_categories: [] })
    })
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ürünlere şu anda ulaşılamıyor.')
  })

  it('allows an admin to create, edit, and delete a product', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession)
    setupApi({ isAdmin: true, email: 'admin@example.com' })
    const newProduct = createTestProduct({ id: 700 })
    const editedProduct = createTestProduct({ id: 700 })
    const fetchMock = vi.mocked(fetch)
    let listedProducts = [sampleProduct]
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === '/api/v1/auth/me') {
        return jsonResponse({
          email: 'admin@example.com',
          roles: ['admin', 'buyer'],
          is_admin: true,
        })
      }
      if (path === '/api/v1/home') {
        return jsonResponse({ message: 'Welcome', featured_categories: [] })
      }
      if (path.startsWith('/api/v1/products?')) {
        return jsonResponse(productList(listedProducts))
      }
      if (path === '/api/v1/products' && init?.method === 'POST') {
        const createdProduct = {
          ...newProduct,
          ...JSON.parse(String(init.body)),
          id: 700,
        }
        listedProducts = [...listedProducts, createdProduct]
        return jsonResponse(createdProduct, 201)
      }
      if (path === '/api/v1/products/700' && init?.method === 'PUT') {
        const updatedProduct = {
          ...editedProduct,
          ...JSON.parse(String(init.body)),
          id: 700,
          updated_at: new Date().toISOString(),
        }
        listedProducts = listedProducts.map((product) =>
          product.id === 700 ? updatedProduct : product,
        )
        return jsonResponse(updatedProduct)
      }
      if (path === '/api/v1/products/700' && init?.method === 'DELETE') {
        listedProducts = listedProducts.filter((product) => product.id !== 700)
        return new Response(null, { status: 204 })
      }
      return jsonResponse({}, 500)
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '+ Ürün ekle' }))
    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Ürün ekle' }))
    await user.type(screen.getByLabelText('Ürün adı'), newProduct.name)
    await user.type(screen.getByLabelText('Kategori'), newProduct.category)
    await user.type(screen.getByLabelText('Açıklama'), newProduct.description)
    await user.type(screen.getByLabelText('Fiyat (TL)'), newProduct.price)
    await user.type(screen.getByLabelText('Stok adedi'), String(newProduct.stock))
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toHaveTextContent(
      newProduct.name,
    )

    await user.click(screen.getByRole('button', { name: `Düzenle ${newProduct.name}` }))
    fireEvent.change(screen.getByLabelText('Ürün adı'), { target: { value: editedProduct.name } })
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toHaveTextContent(
      editedProduct.name,
    )

    await user.click(screen.getByRole('button', { name: `Sil ${editedProduct.name}` }))
    await waitFor(() => {
      expect(screen.queryByText(editedProduct.name)).not.toBeInTheDocument()
    })
  })

  it('lets a seller manage only owned products and start creating a listing', async () => {
    const ownedProduct = createTestProduct({ id: 811, can_manage: true })
    const otherSellerProduct = createTestProduct({ id: 812, can_manage: false })
    setupApi({ isSeller: true, products: [ownedProduct, otherSellerProduct] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '+ Ürün ekle' }))
    expect(await screen.findByLabelText('Ürün adı')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(
      await screen.findByRole('button', { name: `Düzenle ${ownedProduct.name}` }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `Düzenle ${otherSellerProduct.name}` }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Sil ${ownedProduct.name}` })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `Sil ${otherSellerProduct.name}` }),
    ).not.toBeInTheDocument()
  })

  it('allows an admin to open the seller application review queue', async () => {
    setupApi({ isAdmin: true, buyerRole: false })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Satıcı başvurularını yönet' }))

    expect(await screen.findByRole('heading', { name: 'Satıcı başvuruları' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalledWith('/api/v1/cart', expect.anything())
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/seller-applications',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.any(String) }),
        }),
      )
    })
    await user.click(screen.getByRole('button', { name: 'Mağazaya dön' }))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
  })

  it('moves an application through admin review and approval', async () => {
    const application: AdminSellerApplication = {
      id: 901,
      owner_subject: 'buyer-subject',
      applicant_type: 'company',
      legal_name: 'Liva Kozmetik Ltd.',
      representative_name: 'Enes Aysel',
      store_name: 'Liva Care',
      contact_phone: '05551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      primary_category: 'Kişisel bakım',
      business_description: 'Doğal bakım ürünleri',
      status: 'submitted',
      applicant_note: null,
      admin_note: null,
      reviewer_subject: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setupApi({ isAdmin: true, sellerApplications: [application] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Satıcı başvurularını yönet' }))
    expect(await screen.findByText('Liva Care')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'İncelemeye al' }))
    expect(await screen.findByText('İnceleniyor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Onayla' }))

    expect(await screen.findByText('Onaylandı')).toBeInTheDocument()
    const reviewRequests = vi.mocked(fetch).mock.calls.filter(([input]) =>
      String(input).endsWith('/901/review'),
    )
    expect(reviewRequests).toHaveLength(2)
    expect(JSON.parse(String(reviewRequests[0][1]?.body))).toEqual({
      action: 'begin_review',
    })
    expect(JSON.parse(String(reviewRequests[1][1]?.body))).toEqual({
      action: 'approve',
    })
  })

  it('does not offer review decisions that are invalid while role provisioning is pending', async () => {
    const application: AdminSellerApplication = {
      id: 902,
      owner_subject: 'buyer-subject',
      applicant_type: 'company',
      legal_name: 'Liva Kozmetik Ltd.',
      representative_name: 'Enes Aysel',
      store_name: 'Liva Care Pending',
      contact_phone: '05551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      primary_category: 'Kişisel bakım',
      business_description: 'Doğal bakım ürünleri',
      status: 'approval_pending',
      applicant_note: null,
      admin_note: null,
      reviewer_subject: 'admin-subject',
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setupApi({ isAdmin: true, sellerApplications: [application] })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Satıcı başvurularını yönet' }))
    expect(await screen.findByText('Onay işlemi sürüyor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Düzenleme iste' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reddet' })).not.toBeInTheDocument()
  })

  it('does not send a delete request when an admin cancels the confirmation', async () => {
    setupApi({ isAdmin: true })
    vi.mocked(confirm).mockReturnValue(false)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: `Sil ${sampleProduct.name}` }))

    expect(fetch).not.toHaveBeenCalledWith(
      `/api/v1/products/${sampleProduct.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('keeps a product in the catalog and shows an error when deletion fails', async () => {
    setupApi({ isAdmin: true, deleteError: jsonResponse({ detail: 'not found' }, 404) })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: `Sil ${sampleProduct.name}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ürün silinemedi.')
    expect(screen.getByRole('row', { name: new RegExp(sampleProduct.name) })).toBeInTheDocument()
  })

  it('shows a connection error when delete fails due to a network error', async () => {
    setupApi({ isAdmin: true })
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith(`/${sampleProduct.id}`) && init?.method === 'DELETE') {
        throw new TypeError('network failure')
      }
      if (String(input) === '/api/v1/auth/me') {
        return jsonResponse({ email: 'admin@example.com', is_admin: true })
      }
      if (String(input) === '/api/v1/home') {
        return jsonResponse({ message: 'Welcome', featured_categories: [] })
      }
      if (String(input) === '/api/v1/seller-applications/me') {
        return jsonResponse(null)
      }
      if (String(input) === '/api/v1/admin/orders') {
        return jsonResponse([])
      }
      return jsonResponse(productList())
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: `Sil ${sampleProduct.name}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya bağlanılamadı.')
  })

  it('reports a logout redirect failure without hiding the authenticated page', async () => {
    setupApi()
    vi.mocked(endSession).mockRejectedValue(new Error('logout failed'))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çıkış yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Oturum kapatılamadı.')
    expect(screen.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' })).toBeInTheDocument()
  })

  it('passes validated product data to the API while creating from the admin catalog', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession)
    setupApi({ isAdmin: true })
    const user = userEvent.setup()
    render(<App />)
    const newProduct = createTestProduct()

    await user.click(await screen.findByRole('button', { name: '+ Ürün ekle' }))
    fireEvent.change(screen.getByLabelText('Ürün adı'), { target: { value: newProduct.name } })
    fireEvent.change(screen.getByLabelText('Kategori'), { target: { value: newProduct.category } })
    fireEvent.change(screen.getByLabelText('Açıklama'), { target: { value: newProduct.description } })
    fireEvent.change(screen.getByLabelText('Fiyat (TL)'), { target: { value: newProduct.price } })
    fireEvent.change(screen.getByLabelText('Stok adedi'), { target: { value: newProduct.stock } })
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/products',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(productRequest(newProduct)),
        }),
      )
    })
  })
})
