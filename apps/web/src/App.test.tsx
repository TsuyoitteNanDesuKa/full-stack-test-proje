import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Product } from './api'
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
  email?: string
  products?: Product[]
  homeError?: Response
  deleteError?: Response
} = {}) {
  const fetchMock = vi.mocked(fetch)
  fetchMock.mockImplementation(async (input, init) => {
    const path = String(input)
    if (path === '/api/v1/auth/me') {
      return jsonResponse({
        subject: 'keycloak-user',
        email: options.email ?? 'customer@example.com',
        roles: options.isAdmin ? ['admin', 'buyer'] : ['buyer'],
        is_admin: options.isAdmin ?? false,
      })
    }
    if (path === '/api/v1/home') {
      return options.homeError ?? jsonResponse({
        message: 'Alışverişe hoş geldiniz',
        featured_categories: [],
      })
    }
    if (path.startsWith('/api/v1/products?')) {
      return jsonResponse(productList(options.products))
    }
    if (path === '/api/v1/products' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as Product
      return jsonResponse({ ...payload, id: 700 }, 201)
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

  it('uses a generic account label when neither source provides an email', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      accessToken: 'buyer-token',
      email: '',
    })
    setupApi({ email: '' })
    render(<App />)

    expect(await screen.findByText(/Hesabın olarak giriş yaptın/)).toBeInTheDocument()
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
        return jsonResponse(productList())
      }
      if (path === '/api/v1/products' && init?.method === 'POST') {
        return jsonResponse({ ...newProduct, ...JSON.parse(String(init.body)), id: 700 }, 201)
      }
      if (path === '/api/v1/products/700' && init?.method === 'PUT') {
        return jsonResponse({
          ...editedProduct,
          ...JSON.parse(String(init.body)),
          id: 700,
          updated_at: new Date().toISOString(),
        })
      }
      if (path === '/api/v1/products/700' && init?.method === 'DELETE') {
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
