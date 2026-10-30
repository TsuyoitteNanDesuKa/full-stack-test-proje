import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductCreatePage from './ProductCreatePage'
import { createTestProduct, productRequest } from './test/testData'

const createdProduct = createTestProduct()
const invalidProductFields: [string, string][] = [
  ['Ürün adı', 'A'.repeat(33)],
  ['Ürün adı', 'Geçersiz!'],
  ['Kategori', 'K'.repeat(41)],
  ['Kategori', 'Bakım!'],
  ['Açıklama', 'Kısa'],
  ['Açıklama', 'A'.repeat(501)],
  ['Açıklama', 'Geçersiz\u0000 açıklama'],
  ['Fiyat (TL)', '0'],
  ['Fiyat (TL)', '1000000'],
  ['Fiyat (TL)', ''],
  ['Stok adedi', '-1'],
  ['Stok adedi', '1000000'],
  ['Stok adedi', ''],
]
const invalidProductUpdateFields: [string, string][] = [
  ...invalidProductFields,
  ['Ürün adı', 'P'],
  ['Ürün adı', ' P '],
  ['Ürün adı', ' '],
  ['Kategori', 'C'],
  ['Kategori', ' C '],
  ['Açıklama', 'D'.repeat(9)],
  ['Açıklama', '         x'],
  ['Fiyat (TL)', '-0.01'],
  ['Fiyat (TL)', '1.999'],
  ['Fiyat (TL)', 'not-a-price'],
  ['Stok adedi', '1.5'],
]

function fillValidForm(product = createdProduct) {
  fireEvent.change(screen.getByLabelText('Ürün adı'), { target: { value: product.name } })
  fireEvent.change(screen.getByLabelText('Kategori'), {
    target: { value: product.category },
  })
  fireEvent.change(screen.getByLabelText('Açıklama'), {
    target: { value: product.description },
  })
  fireEvent.change(screen.getByLabelText('Fiyat (TL)'), {
    target: { value: product.price },
  })
  fireEvent.change(screen.getByLabelText('Stok adedi'), {
    target: { value: String(product.stock) },
  })
}

describe('admin product creation page', () => {
  const onCancel = vi.fn()
  const onSaved = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    onCancel.mockReset()
    onSaved.mockReset()
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
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('heading', { name: 'Yeni ürün ekle' })).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalledWith(createdProduct)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer admin-token',
        }),
        body: JSON.stringify({
          ...productRequest(createdProduct),
          price: String(Number(createdProduct.price)),
        }),
      }),
    )
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('normalizes decomposed product names to Unicode NFC before sending', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(createdProduct), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    const nfcName = `Cafe\u0301 ${createTestProduct().name.slice(-20)}`
    fireEvent.change(screen.getByLabelText('Ürün adı'), { target: { value: nfcName } })
    fireEvent.change(screen.getByLabelText('Kategori'), {
      target: { value: createdProduct.category },
    })
    fireEvent.change(screen.getByLabelText('Açıklama'), {
      target: { value: createdProduct.description },
    })
    fireEvent.change(screen.getByLabelText('Fiyat (TL)'), {
      target: { value: createdProduct.price },
    })
    fireEvent.change(screen.getByLabelText('Stok adedi'), {
      target: { value: String(createdProduct.stock) },
    })

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products',
      expect.objectContaining({
        body: JSON.stringify({
          ...productRequest(createdProduct),
          name: nfcName.normalize('NFC'),
          price: String(Number(createdProduct.price)),
        }),
      }),
    )
  })

  it('pre-fills every product field and sends all edits to the update endpoint', async () => {
    const updatedProduct = createTestProduct({
      id: createdProduct.id,
      updated_at: new Date().toISOString(),
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updatedProduct), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage
        product={createdProduct}
        token="admin-token"
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Ürünü düzenle' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ürün adı')).toHaveValue(createdProduct.name)
    expect(screen.getByLabelText('Kategori')).toHaveValue(createdProduct.category)
    expect(screen.getByLabelText('Açıklama')).toHaveValue(createdProduct.description)
    expect(screen.getByLabelText('Fiyat (TL)')).toHaveValue(Number(createdProduct.price))
    expect(screen.getByLabelText('Stok adedi')).toHaveValue(createdProduct.stock)

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

    expect(onSaved).toHaveBeenCalledWith(updatedProduct)
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/products/${createdProduct.id}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          ...productRequest(updatedProduct),
        }),
      }),
    )
  })

  it('shows a safe conflict message when an update uses another product name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage
        product={createdProduct}
        token="admin-token"
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )
    const conflictingName = createTestProduct().name
    fireEvent.change(screen.getByLabelText('Ürün adı'), {
      target: { value: conflictingName },
    })
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Bu ürün adı katalogda zaten kullanılıyor.')
    expect(alert).not.toHaveTextContent('Private server detail.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('explains when a product being edited no longer exists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage
        product={createdProduct}
        token="admin-token"
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Düzenlenecek ürün bulunamadı. Ürün listesini yenileyip tekrar dene.',
    )
    expect(alert).not.toHaveTextContent('Private server detail.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows an edit-specific message for unexpected update failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    render(
      <ProductCreatePage
        product={createdProduct}
        token="admin-token"
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ürün güncellenemedi. Lütfen tekrar dene.')
    expect(alert).not.toHaveTextContent('Private server detail.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('requires every field and rejects invalid price and stock before sending', async () => {
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Ürün adı')).toBeInvalid()

    await user.type(screen.getByLabelText('Ürün adı'), createdProduct.name)
    await user.type(screen.getByLabelText('Kategori'), createdProduct.category)
    await user.type(screen.getByLabelText('Açıklama'), createdProduct.description)
    await user.type(screen.getByLabelText('Fiyat (TL)'), '0')
    await user.type(screen.getByLabelText('Stok adedi'), '-1')
    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fiyat (TL)')).toBeInvalid()
  })

  it('rejects a description that is too short after trimming whitespace', async () => {
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    await user.type(screen.getByLabelText('Ürün adı'), createdProduct.name)
    await user.type(screen.getByLabelText('Kategori'), createdProduct.category)
    fireEvent.change(screen.getByLabelText('Açıklama'), {
      target: { value: '         x' },
    })
    await user.type(screen.getByLabelText('Fiyat (TL)'), createdProduct.price)
    await user.type(screen.getByLabelText('Stok adedi'), String(createdProduct.stock))

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürün bilgilerini kontrol edip tekrar dene.',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exposes the same field constraints as the product API', () => {
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )

    expect(screen.getByLabelText('Ürün adı')).toHaveAttribute('maxLength', '32')
    expect(screen.getByLabelText('Kategori')).toHaveAttribute('maxLength', '40')
    expect(screen.getByLabelText('Açıklama')).toHaveAttribute('minLength', '10')
    expect(screen.getByLabelText('Açıklama')).toHaveAttribute('maxLength', '500')
    expect(screen.getByLabelText('Fiyat (TL)')).toHaveAttribute('min', '0.01')
    expect(screen.getByLabelText('Fiyat (TL)')).toHaveAttribute('max', '999999.99')
    expect(screen.getByLabelText('Stok adedi')).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('Stok adedi')).toHaveAttribute('max', '999999')
  })

  it.each(invalidProductFields)(
    'blocks invalid %s value %s before the API request',
    async (field, invalidValue) => {
      render(
        <ProductCreatePage
          token="admin-token"
          onCancel={onCancel}
          onSaved={onSaved}
        />,
      )

      fillValidForm()
      fireEvent.change(screen.getByLabelText(field), {
        target: { value: invalidValue },
      })
      fireEvent.submit(
        screen.getByRole('button', { name: 'Ürünü kaydet' }).closest('form')!,
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ürün bilgilerini kontrol edip tekrar dene.',
      )
      expect(fetch).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
    },
  )

  it.each(invalidProductUpdateFields)(
    'blocks invalid %s value %s when editing before the API request',
    async (field, invalidValue) => {
      render(
        <ProductCreatePage
          product={createdProduct}
          token="admin-token"
          onCancel={onCancel}
          onSaved={onSaved}
        />,
      )

      fireEvent.change(screen.getByLabelText(field), {
        target: { value: invalidValue },
      })
      fireEvent.submit(
        screen.getByRole('button', { name: 'Değişiklikleri kaydet' }).closest('form')!,
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ürün bilgilerini kontrol edip tekrar dene.',
      )
      expect(fetch).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
    },
  )

  it.each([
    [401, 'Oturum süren dolmuş. Çıkış yapıp yeniden giriş yap.'],
    [403, 'Bu işlem için yönetici yetkisi gereklidir.'],
    [409, 'Bu ürün adı katalogda zaten kullanılıyor.'],
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
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(alert).not.toHaveTextContent('Private server detail.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a connection message when the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Ürünü kaydet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya bağlanılamadı.')
  })

  it('shows a generic message for unexpected errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Unexpected error'))
    const user = userEvent.setup()
    render(
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    fillValidForm()

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
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )
    fillValidForm()

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
      <ProductCreatePage token="admin-token" onCancel={onCancel} onSaved={onSaved} />,
    )

    await user.click(screen.getByRole('button', { name: 'Ürün listesine dön' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
})
