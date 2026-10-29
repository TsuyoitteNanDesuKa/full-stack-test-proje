import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductCreatePage from './ProductCreatePage'

const createdProduct = {
  id: 8,
  name: 'Yeni Ürün',
  category: 'Ev ve Yaşam',
  description: 'El yapımı dekoratif ürün.',
  price: '299.90',
  stock: 7,
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Ürün adı'), 'Yeni Ürün')
  await user.type(screen.getByLabelText('Kategori'), 'Ev ve Yaşam')
  await user.type(screen.getByLabelText('Açıklama'), 'El yapımı dekoratif ürün.')
  await user.type(screen.getByLabelText('Fiyat (TL)'), '299.90')
  await user.type(screen.getByLabelText('Stok adedi'), '7')
  return user
}

describe('admin product creation page', () => {
  const onCancel = vi.fn()
  const onCreated = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    onCancel.mockReset()
    onCreated.mockReset()
  })

  it('creates a product with the entered values and returns it to the caller', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(createdProduct), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('heading', { name: 'Yeni ürün ekle' })).toBeInTheDocument()
    expect(onCreated).toHaveBeenCalledWith(createdProduct)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
        }),
        body: JSON.stringify({
          name: 'Yeni Ürün',
          category: 'Ev ve Yaşam',
          description: 'El yapımı dekoratif ürün.',
          price: '299.9',
          stock: 7,
        }),
      }),
    )
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('requires every field and rejects invalid price and stock before sending', async () => {
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Ürün adı')).toBeInvalid()

    await user.type(screen.getByLabelText('Ürün adı'), 'Yeni Ürün')
    await user.type(screen.getByLabelText('Kategori'), 'Ev ve Yaşam')
    await user.type(screen.getByLabelText('Açıklama'), 'Açıklama')
    await user.type(screen.getByLabelText('Fiyat (TL)'), '0')
    await user.type(screen.getByLabelText('Stok adedi'), '-1')
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fiyat (TL)')).toBeInvalid()
  })

  it.each([
    [401, 'Oturum süren dolmuş. Çıkış yapıp yeniden giriş yap.'],
    [403, 'Bu işlem için yönetici yetkisi gereklidir.'],
    [422, 'Ürün bilgilerini kontrol edip tekrar dene.'],
    [500, 'Ürün eklenemedi. Lütfen tekrar dene.'],
  ])('shows a safe message when the API returns %i', async (status, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(alert).not.toHaveTextContent('Private server detail.')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows a connection message when the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya bağlanılamadı.')
  })

  it('shows a generic message for unexpected errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Unexpected error'))
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürün eklenemedi. Lütfen tekrar dene.',
    )
  })

  it('prevents duplicate submissions while the create request is pending', async () => {
    let resolveRequest: (response: Response) => void = () => {
      throw new Error('Product request was not initialized.')
    }
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))
    expect(screen.getByRole('button', { name: 'Ürün ekleniyor...' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'İptal' }))
    expect(onCancel).toHaveBeenCalledOnce()

    resolveRequest(
      new Response(JSON.stringify(createdProduct), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('allows cancelling the form without submitting it', async () => {
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onCreated={onCreated} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
})
