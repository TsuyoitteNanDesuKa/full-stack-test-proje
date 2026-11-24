import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FavoritesPanel from './FavoritesPanel'
import { getFavorites, removeFavorite } from './api'
import { createTestProduct } from './test/testData'

vi.mock('./api', () => ({ getFavorites: vi.fn(), removeFavorite: vi.fn() }))

const product = createTestProduct({ id: 42, name: 'Favori ürün' })
const page = { items: [product], limit: 20, offset: 0, has_more: false }

describe('FavoritesPanel', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows loading, empty and retries a load failure', async () => {
    vi.mocked(getFavorites).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...page, items: [] })
    const user = userEvent.setup()
    render(<FavoritesPanel token="token" onOpenProduct={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Favoriler yükleniyor')
    expect(await screen.findByRole('alert')).toHaveTextContent('Favoriler yüklenemedi')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Henüz favori ürünün yok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Önceki sayfa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sonraki sayfa' })).toBeDisabled()
  })

  it('opens a product and reports removal failure before retrying', async () => {
    vi.mocked(getFavorites).mockResolvedValueOnce(page).mockResolvedValueOnce({ ...page, items: [] })
    vi.mocked(removeFavorite).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
    const user = userEvent.setup()
    const onOpenProduct = vi.fn()
    render(<FavoritesPanel token="token" onOpenProduct={onOpenProduct} />)
    await user.click(await screen.findByRole('button', { name: 'Favori ürün' }))
    expect(onOpenProduct).toHaveBeenCalledWith(42)
    await user.click(screen.getByRole('button', { name: 'Favori ürün favorilerden çıkar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('çıkarılamadı')
    await user.click(screen.getByRole('button', { name: 'Favori ürün favorilerden çıkar' }))
    expect(await screen.findByText('Henüz favori ürünün yok.')).toBeInTheDocument()
    expect(removeFavorite).toHaveBeenCalledWith('token', 42)
  })

  it('navigates pages and returns to the previous page after removing its last item', async () => {
    vi.mocked(getFavorites)
      .mockResolvedValueOnce({ ...page, has_more: true })
      .mockResolvedValueOnce({ ...page, offset: 20 })
      .mockResolvedValueOnce({ ...page, offset: 20, items: [] })
      .mockResolvedValueOnce({ ...page, items: [] })
    vi.mocked(removeFavorite).mockResolvedValue()
    const user = userEvent.setup()
    render(<FavoritesPanel token="token" onOpenProduct={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Sonraki sayfa' }))
    await waitFor(() => expect(getFavorites).toHaveBeenCalledWith('token', 20, 20))
    await user.click(await screen.findByRole('button', { name: 'Favori ürün favorilerden çıkar' }))
    expect(await screen.findByText('Henüz favori ürünün yok.')).toBeInTheDocument()
    expect(getFavorites).toHaveBeenLastCalledWith('token', 20, 0)
  })

  it('allows navigating to the previous page', async () => {
    vi.mocked(getFavorites).mockResolvedValue({ ...page, has_more: true })
    const user = userEvent.setup()
    render(<FavoritesPanel token="token" onOpenProduct={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Sonraki sayfa' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Önceki sayfa' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Önceki sayfa' }))
    await waitFor(() => expect(getFavorites).toHaveBeenLastCalledWith('token', 20, 0))
  })

  it('does not present a stale page after a page request fails', async () => {
    vi.mocked(getFavorites).mockResolvedValueOnce({ ...page, has_more: true })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...page, offset: 20 })
    const user = userEvent.setup()
    render(<FavoritesPanel token="token" onOpenProduct={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Sonraki sayfa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Favoriler yüklenemedi')
    expect(screen.queryByRole('button', { name: 'Favori ürün' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByRole('button', { name: 'Favori ürün' })).toBeInTheDocument()
    expect(getFavorites).toHaveBeenLastCalledWith('token', 20, 20)
  })
})
