import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Product } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  const responseBody =
    body !== null && typeof body === 'object' && 'access_token' in body
      ? { is_admin: false, ...body }
      : body
  return new Response(JSON.stringify(responseBody), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sampleProduct: Product = {
  id: 1,
  name: 'Lavanta El Kremi',
  category: 'Kişisel Bakım',
  description: 'Günlük kullanım için nemlendirici el kremi.',
  price: '129.90',
  stock: 24,
  updated_at: null,
}

function productList(products: typeof sampleProduct[] = [sampleProduct]) {
  return { products, total: products.length, limit: 20, offset: 0 }
}

describe('customer login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows the storefront after logging in and fetching the home page', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'signed-token',
            token_type: 'bearer',
            expires_in: 1800,
            is_admin: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Alışverişe hoş geldiniz',
            featured_categories: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          productList([
            {
              ...sampleProduct,
              updated_at: '2026-10-29T10:00:00',
            },
          ]),
        ),
      )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(
      await screen.findByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('customer@example.com olarak giriş yaptın. Sana iyi gelecek şeyler burada başlıyor.')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Ürün ekle' })).not.toBeInTheDocument()
    const productRow = screen.getByRole('row', { name: /Lavanta El Kremi/ })
    expect(productRow).toHaveTextContent('Kişisel Bakım')
    expect(productRow).toHaveTextContent('Günlük kullanım için nemlendirici el kremi.')
    expect(productRow).toHaveTextContent('₺129,90')
    expect(productRow).toHaveTextContent('24')
    expect(productRow).toHaveTextContent('Güncellendi')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'correct-password',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/home',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-token' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/products?limit=20&offset=0',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-token' }),
      }),
    )

    await user.click(screen.getByRole('button', { name: /çıkış yap/i }))
    expect(screen.getByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
  })

  it('lets an administrator create and update products in the catalog', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'admin-token',
          token_type: 'bearer',
          expires_in: 1800,
          is_admin: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Welcome', featured_categories: [] }),
      )
      .mockResolvedValueOnce(jsonResponse(productList()))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ...sampleProduct,
            id: 2,
            name: 'Yeni Yönetici Ürünü',
            price: '299.90',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...sampleProduct,
          id: 2,
          name: 'Güncellenmiş Yönetici Ürünü',
          category: 'Ev ve Yaşam',
          description: 'Güncellenen ürün açıklaması.',
          price: '399.90',
          stock: 31,
          updated_at: '2026-10-29T10:00:00',
        }),
      )

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    await screen.findByRole('heading', { name: 'Welcome.' })
    await user.click(await screen.findByRole('button', { name: '+ Ürün ekle' }))
    expect(screen.getByRole('heading', { name: 'Yeni ürün ekle' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(await screen.findByRole('row', { name: /Lavanta El Kremi/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Ürün ekle' }))

    await user.type(screen.getByLabelText('Ürün adı'), 'Yeni Yönetici Ürünü')
    await user.type(screen.getByLabelText('Kategori'), 'Kişisel Bakım')
    await user.type(screen.getByLabelText('Açıklama'), 'Günlük kullanım ürünü.')
    await user.type(screen.getByLabelText('Fiyat (TL)'), '299.90')
    await user.type(screen.getByLabelText('Stok adedi'), '24')
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toHaveTextContent(
      'Yeni Yönetici Ürünü',
    )
    expect(
      screen.getByRole('row', { name: /Yeni Yönetici Ürünü/ }),
    ).not.toHaveTextContent('Güncellendi')
    await user.click(screen.getByRole('button', { name: 'Düzenle Yeni Yönetici Ürünü' }))
    expect(screen.getByLabelText('Ürün adı')).toHaveValue('Yeni Yönetici Ürünü')
    expect(screen.getByLabelText('Kategori')).toHaveValue('Kişisel Bakım')
    expect(screen.getByLabelText('Açıklama')).toHaveValue(
      'Günlük kullanım için nemlendirici el kremi.',
    )
    expect(screen.getByLabelText('Fiyat (TL)')).toHaveValue(299.9)
    expect(screen.getByLabelText('Stok adedi')).toHaveValue(24)
    await user.clear(screen.getByLabelText('Ürün adı'))
    await user.type(screen.getByLabelText('Ürün adı'), 'Güncellenmiş Yönetici Ürünü')
    await user.clear(screen.getByLabelText('Kategori'))
    await user.type(screen.getByLabelText('Kategori'), 'Ev ve Yaşam')
    await user.clear(screen.getByLabelText('Açıklama'))
    await user.type(screen.getByLabelText('Açıklama'), 'Güncellenen ürün açıklaması.')
    await user.clear(screen.getByLabelText('Fiyat (TL)'))
    await user.type(screen.getByLabelText('Fiyat (TL)'), '399.90')
    await user.clear(screen.getByLabelText('Stok adedi'))
    await user.type(screen.getByLabelText('Stok adedi'), '31')
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    const updatedRow = await screen.findByRole('row', {
      name: /Güncellenmiş Yönetici Ürünü/,
    })
    expect(updatedRow).toHaveTextContent('Ev ve Yaşam')
    expect(updatedRow).toHaveTextContent('Güncellenen ürün açıklaması.')
    expect(updatedRow).toHaveTextContent('₺399,90')
    expect(updatedRow).toHaveTextContent('31')
    expect(updatedRow).toHaveTextContent('Güncellendi')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/products/2',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      }),
    )
  })

  it('shows an understandable message for incorrect credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Geçersiz e-posta veya parola.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-posta adresi veya parola hatalı. Bilgilerini kontrol edip tekrar dene.',
    )
  })

  it.each([
    [422, 'E-posta adresi veya parola biçimi geçersiz.'],
    [503, 'Giriş sırasında bir sorun oluştu. Lütfen tekrar dene.'],
  ])('shows a useful message when the login API returns %i', async (status, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Private server detail.')
  })

  it('shows a connection message when the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuya bağlanılamadı.',
    )
  })

  it('blocks empty and malformed form input before sending a request', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'E-posta adresi' })).toBeInvalid()

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'not-an-email')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'E-posta adresi' })).toBeInvalid()
  })

  it('keeps the submit button disabled while login and home requests are pending', async () => {
    let resolveLogin: (response: Response) => void = () => {
      throw new Error('Login request was not initialized.')
    }
    let resolveHome: (response: Response) => void = () => {
      throw new Error('Home request was not initialized.')
    }
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveHome = resolve
          }),
      )
      .mockResolvedValueOnce(jsonResponse(productList()))

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    const submitButton = screen.getByRole('button', { name: /giriş yapılıyor/i })
    expect(submitButton).toBeDisabled()

    resolveLogin(jsonResponse({
      access_token: 'signed-token',
      token_type: 'bearer',
      expires_in: 1800,
    }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(submitButton).toBeDisabled()

    resolveHome(jsonResponse({ message: 'Welcome', featured_categories: [] }))
    expect(await screen.findByRole('heading', { name: 'Welcome.' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
  })

  it('keeps the login form available if the protected home request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Kimlik doğrulaması gerekli.' }, 401),
      )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Giriş başarılı ancak ana sayfa açılamadı.',
    )
    expect(screen.getByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
  })

  it('shows an empty product state when the catalog has no products', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Welcome', featured_categories: [] }),
      )
      .mockResolvedValueOnce(jsonResponse(productList([])))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByText('Henüz listelenecek ürün yok.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Ürün listesi' })).not.toBeInTheDocument()
  })

  it('announces product loading until the catalog request completes', async () => {
    let resolveProducts: (response: Response) => void = () => {
      throw new Error('Product request was not initialized.')
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Welcome', featured_categories: [] }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProducts = resolve
          }),
      )

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('heading', { name: 'Welcome.' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Ürünler yükleniyor...')
    expect(screen.queryByRole('table', { name: 'Ürün listesi' })).not.toBeInTheDocument()

    resolveProducts(jsonResponse(productList()))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
  })

  it('shows product API errors and lets the customer retry', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Welcome', featured_categories: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Private server detail.' }, 503),
      )
      .mockResolvedValueOnce(jsonResponse(productList()))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürünler yüklenemedi. Lütfen tekrar dene.',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('Private server detail.')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toBeInTheDocument()
  })

  it('shows a connection-specific message when the product service is unavailable', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Welcome', featured_categories: [] }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürünlere şu anda ulaşılamıyor.',
    )
  })

  it.each(['resolved', 'rejected'] as const)(
    'ignores a product request that is %s after logout',
    async (outcome) => {
      let resolveProducts: (response: Response) => void = () => {
        throw new Error('Product request was not initialized.')
      }
      let rejectProducts: (error: Error) => void = () => {
        throw new Error('Product request was not initialized.')
      }
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: 'signed-token',
            token_type: 'bearer',
            expires_in: 1800,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ message: 'Welcome', featured_categories: [] }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveProducts = resolve
              rejectProducts = reject
            }),
        )

      const user = userEvent.setup()
      render(<App />)
      await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
      await user.type(screen.getByLabelText('Parola'), 'correct-password')
      await user.click(screen.getByRole('button', { name: /giriş yap/i }))
      await screen.findByRole('heading', { name: 'Welcome.' })
      await screen.findByRole('status')
      await user.click(screen.getByRole('button', { name: /çıkış yap/i }))

      if (outcome === 'resolved') {
        resolveProducts(jsonResponse(productList()))
      } else {
        rejectProducts(new TypeError('Failed to fetch'))
      }

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.getByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
    },
  )

  it('can reveal and hide the password without submitting the form', async () => {
    const user = userEvent.setup()
    render(<App />)

    const passwordInput = screen.getByLabelText('Parola', { exact: true })
    await user.type(passwordInput, 'private-password')
    await user.click(screen.getByRole('button', { name: 'Parolayı göster' }))

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Parolayı gizle' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Parolayı gizle' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
