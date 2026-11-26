import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductDetailPanel from './ProductDetailPanel'
import { addFavorite, ApiError, getProduct, getReviews } from './api'
import type { Product } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getProduct: vi.fn(),
  addFavorite: vi.fn(),
  getReviews: vi.fn(),
}))

const product: Product = {
  id: 12,
  name: 'Sample product',
  category: 'Home',
  description: 'A sample description',
  price: '19.90',
  stock: 4,
  can_manage: false,
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
} as unknown as Product

function renderDetail(overrides: Partial<Parameters<typeof ProductDetailPanel>[0]> = {}) {
  const props = {
    token: 'buyer-token',
    productId: 12,
    isBuyer: true,
    addedToCart: false,
    cartMessage: '',
    isAdding: false,
    onAddToCart: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  render(<ProductDetailPanel {...props} />)
  return props
}

describe('ProductDetailPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a loading state before the product arrives', async () => {
    vi.mocked(getProduct).mockReturnValue(new Promise(() => {}))

    renderDetail()

    expect(screen.getByRole('status')).toHaveTextContent('Ürün yükleniyor...')
  })

  it('renders current price, stock and category for an available product', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)

    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Sample product' })).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Stok: 4')).toBeInTheDocument()
    expect(getProduct).toHaveBeenCalledWith('buyer-token', 12)
  })

  it('shows a not-found alert for a 404 response', async () => {
    vi.mocked(getProduct).mockRejectedValue(new ApiError('Ürün bulunamadı.', 404))

    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('Ürün bulunamadı.')
  })

  it('shows a retryable error and recovers on retry', async () => {
    vi.mocked(getProduct)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(product)
    const user = userEvent.setup()

    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ürün bilgisi alınamadı. Lütfen tekrar dene.',
    )
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(await screen.findByRole('heading', { name: 'Sample product' })).toBeInTheDocument()
    await waitFor(() => expect(getProduct).toHaveBeenCalledTimes(2))
  })

  it('hides the add-to-cart action and explains when the product is out of stock', async () => {
    vi.mocked(getProduct).mockResolvedValue({ ...product, stock: 0 })

    renderDetail()

    expect(await screen.findByText('Bu ürün şu anda stokta yok.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sepete ekle' })).not.toBeInTheDocument()
  })

  it('adds the loaded product to the cart from the detail page', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)
    const user = userEvent.setup()
    const props = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Sepete ekle' }))

    expect(props.onAddToCart).toHaveBeenCalledWith(product)
  })

  it('confirms a successful add to cart on the detail page', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)

    renderDetail({ addedToCart: true })

    expect(await screen.findByText('Ürün sepetine eklendi.')).toBeInTheDocument()
  })

  it('shows the cart error on the detail page when adding fails', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)

    renderDetail({ cartMessage: 'Stok yetersiz.' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Stok yetersiz.')
  })

  it('disables the add action while the cart update is in progress', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)

    renderDetail({ isAdding: true })

    expect(await screen.findByRole('button', { name: 'Sepete ekleniyor...' })).toBeDisabled()
  })

  it('disables the add action while another cart mutation is in progress', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)

    renderDetail({ isCartBusy: true })

    expect(await screen.findByRole('button', { name: 'Sepete ekle' })).toBeDisabled()
  })

  it('returns to the catalog through the back action', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)
    const user = userEvent.setup()
    const props = renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Kataloğa dön' }))

    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('lets buyers add an out-of-stock product and reports success or failure', async () => {
    vi.mocked(getProduct).mockResolvedValue({ ...product, stock: 0 })
    vi.mocked(addFavorite).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
    const user = userEvent.setup()
    renderDetail()

    await user.click(await screen.findByRole('button', { name: 'Favorilere ekle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ürün favorilere eklenemedi')
    await user.click(screen.getByRole('button', { name: 'Favorilere ekle' }))
    expect(await screen.findByText('Ürün favorilerine eklendi.')).toBeInTheDocument()
    expect(addFavorite).toHaveBeenCalledWith('buyer-token', 12)
  })

  it('disables adding while the request is pending and hides the action for non-buyers', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)
    vi.mocked(addFavorite).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    const props = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Favorilere ekle' }))
    expect(screen.getByRole('button', { name: 'Favorilere ekleniyor...' })).toBeDisabled()
    expect(props.isBuyer).toBe(true)
  })

  it('does not offer favorites to non-buyers', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)
    renderDetail({ isBuyer: false })
    await screen.findByRole('heading', { name: 'Sample product' })
    expect(screen.queryByRole('button', { name: 'Favorilere ekle' })).not.toBeInTheDocument()
  })

  it('loads reviews only when opened and closes them on request', async () => {
    vi.mocked(getProduct).mockResolvedValue(product)
    vi.mocked(getReviews).mockResolvedValue({
      items: [], my_review: null, can_review: false, limit: 20, offset: 0, has_more: false,
    })
    const user = userEvent.setup()
    renderDetail()
    const button = await screen.findByRole('button', { name: 'Değerlendirmeleri göster' })
    expect(getReviews).not.toHaveBeenCalled()
    await user.click(button)
    expect(await screen.findByText('Henüz değerlendirme yok.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeleri kapat' }))
    expect(screen.queryByRole('region', { name: 'Ürün değerlendirmeleri' })).not.toBeInTheDocument()
  })
})
