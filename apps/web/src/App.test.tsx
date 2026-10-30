import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Product } from './api'
import { createTestProduct } from './test/testData'

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

const sampleProduct: Product = createTestProduct()

function productList(products: typeof sampleProduct[] = [sampleProduct]) {
  return { products, total: products.length, limit: 20, offset: 0 }
}

describe('customer login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
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
    expect(screen.queryByRole('button', { name: /^Sil / })).not.toBeInTheDocument()
    const productRow = screen.getByRole('row', { name: new RegExp(sampleProduct.name) })
    expect(productRow).toHaveTextContent(sampleProduct.category)
    expect(productRow).toHaveTextContent(sampleProduct.description)
    expect(productRow).toHaveTextContent(
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(Number(sampleProduct.price)),
    )
    expect(productRow).toHaveTextContent(String(sampleProduct.stock))
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
    const newProduct = createTestProduct({
      id: (sampleProduct.id % 100_000) + 1,
    })
    const updatedProduct = createTestProduct({
      id: newProduct.id,
      updated_at: new Date().toISOString(),
    })
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
        jsonResponse(newProduct, 201),
      )
      .mockResolvedValueOnce(jsonResponse(updatedProduct))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    await screen.findByRole('heading', { name: 'Welcome.' })
    await user.click(await screen.findByRole('button', { name: '+ Ürün ekle' }))
    expect(screen.getByRole('heading', { name: 'Yeni ürün ekle' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(
      await screen.findByRole('row', { name: new RegExp(sampleProduct.name) }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Ürün ekle' }))

    fireEvent.change(screen.getByLabelText('Ürün adı'), {
      target: { value: newProduct.name },
    })
    fireEvent.change(screen.getByLabelText('Kategori'), {
      target: { value: newProduct.category },
    })
    fireEvent.change(screen.getByLabelText('Açıklama'), {
      target: { value: newProduct.description },
    })
    fireEvent.change(screen.getByLabelText('Fiyat (TL)'), {
      target: { value: newProduct.price },
    })
    fireEvent.change(screen.getByLabelText('Stok adedi'), {
      target: { value: String(newProduct.stock) },
    })
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('table', { name: 'Ürün listesi' })).toHaveTextContent(
      newProduct.name,
    )
    const newProductRow = screen.getByRole('row', { name: new RegExp(newProduct.name) })
    expect(newProductRow).not.toHaveTextContent('Güncellendi')
    await user.click(
      screen.getByRole('button', { name: `Düzenle ${newProduct.name}` }),
    )
    expect(screen.getByLabelText('Ürün adı')).toHaveValue(newProduct.name)
    expect(screen.getByLabelText('Kategori')).toHaveValue(newProduct.category)
    expect(screen.getByLabelText('Açıklama')).toHaveValue(newProduct.description)
    expect(screen.getByLabelText('Fiyat (TL)')).toHaveValue(Number(newProduct.price))
    expect(screen.getByLabelText('Stok adedi')).toHaveValue(newProduct.stock)
    fireEvent.change(screen.getByLabelText('Ürün adı'), {
      target: { value: updatedProduct.name },
    })
    fireEvent.change(screen.getByLabelText('Kategori'), {
      target: { value: updatedProduct.category },
    })
    fireEvent.change(screen.getByLabelText('Açıklama'), {
      target: { value: updatedProduct.description },
    })
    fireEvent.change(screen.getByLabelText('Fiyat (TL)'), {
      target: { value: updatedProduct.price },
    })
    fireEvent.change(screen.getByLabelText('Stok adedi'), {
      target: { value: String(updatedProduct.stock) },
    })
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    const updatedRow = await screen.findByRole('row', {
      name: new RegExp(updatedProduct.name),
    })
    expect(updatedRow).toHaveTextContent(updatedProduct.category)
    expect(updatedRow).toHaveTextContent(updatedProduct.description)
    expect(updatedRow).toHaveTextContent(
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(Number(updatedProduct.price)),
    )
    expect(updatedRow).toHaveTextContent(String(updatedProduct.stock))
    expect(updatedRow).toHaveTextContent('Güncellendi')
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/v1/products/${newProduct.id}`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      }),
    )
  })

  it('requires confirmation and removes only the deleted product from the catalog', async () => {
    const remainingProduct = createTestProduct()
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
      .mockResolvedValueOnce(jsonResponse(productList([sampleProduct, remainingProduct])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    const deletedRow = await screen.findByRole('row', {
      name: new RegExp(sampleProduct.name),
    })
    vi.mocked(confirm).mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(deletedRow).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))
    await waitFor(() => expect(deletedRow).not.toBeInTheDocument())

    expect(
      screen.getByRole('row', { name: new RegExp(remainingProduct.name) }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 ürün')).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/v1/products/${sampleProduct.id}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      }),
    )
  })

  it('keeps the product visible and shows an error when deletion fails', async () => {
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
        jsonResponse({ detail: 'Private server detail.' }, 500),
      )

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    const productRow = await screen.findByRole('row', {
      name: new RegExp(sampleProduct.name),
    })
    await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürün silinemedi. Lütfen tekrar dene.',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('Private server detail.')
    expect(productRow).toBeInTheDocument()
  })

  it.each([401, 404])(
    'keeps the product visible and shows a safe message when deletion returns %i',
    async (status) => {
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
          jsonResponse({ detail: 'Private server detail.' }, status),
        )

      const user = userEvent.setup()
      render(<App />)
      await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
      await user.type(screen.getByLabelText('Parola'), 'correct-password')
      await user.click(screen.getByRole('button', { name: /giriş yap/i }))

      const productRow = await screen.findByRole('row', {
        name: new RegExp(sampleProduct.name),
      })
      await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ürün silinemedi. Lütfen tekrar dene.',
      )
      expect(screen.getByRole('alert')).not.toHaveTextContent('Private server detail.')
      expect(productRow).toBeInTheDocument()
    },
  )

  it('shows a connection error and keeps the product visible when deletion cannot reach the API', async () => {
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
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    const productRow = await screen.findByRole('row', {
      name: new RegExp(sampleProduct.name),
    })
    await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuya bağlanılamadı. Ürün silinemedi; tekrar deneyin.',
    )
    expect(productRow).toBeInTheDocument()
  })

  it('disables the delete action and sends only one request while deletion is pending', async () => {
    let resolveDeletion: (response: Response) => void = () => {
      throw new Error('Delete request was not initialized.')
    }
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
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDeletion = resolve
          }),
      )

    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('E-posta adresi'), 'admin@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    await screen.findByRole('row', { name: new RegExp(sampleProduct.name) })
    await user.click(screen.getByRole('button', { name: `Sil ${sampleProduct.name}` }))

    const deletingButton = screen.getByRole('button', {
      name: `Sil ${sampleProduct.name}`,
    })
    expect(deletingButton).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(4)

    resolveDeletion(new Response(null, { status: 204 }))
    await waitFor(() =>
      expect(
        screen.queryByRole('row', { name: new RegExp(sampleProduct.name) }),
      ).not.toBeInTheDocument(),
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
