import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewsPanel from './ReviewsPanel'
import { ApiError, deleteReview, getReviews, saveReview } from './api'
import type { ProductReview, ProductReviewPage } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getReviews: vi.fn(),
  saveReview: vi.fn(),
  deleteReview: vi.fn(),
}))

const review: ProductReview = {
  id: 1, rating: 4, comment: 'Çok güzel bir ürün.', created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', is_mine: true,
}
const empty: ProductReviewPage = {
  items: [], my_review: null, can_review: true, limit: 20, offset: 0, has_more: false,
}

describe('ReviewsPanel', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reports loading failure and retries; ineligible users cannot write', async () => {
    vi.mocked(getReviews).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...empty, can_review: false })
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    expect(screen.getByRole('status')).toHaveTextContent('yükleniyor')
    expect(await screen.findByRole('alert')).toHaveTextContent('yüklenemedi')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Henüz değerlendirme yok.')).toBeInTheDocument()
    expect(screen.getByText(/ürünü alıcı olarak teslim/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Yorum')).not.toBeInTheDocument()
  })

  it('creates, edits and removes the buyer review', async () => {
    const first = { ...empty, items: [review], my_review: review }
    const edited = { ...review, rating: 2, comment: 'Yeni değerlendirme.', updated_at: 'later' }
    vi.mocked(getReviews).mockResolvedValueOnce(empty).mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...empty, items: [edited], my_review: edited })
      .mockResolvedValueOnce(empty)
    vi.mocked(saveReview).mockResolvedValueOnce(review).mockResolvedValueOnce(edited)
    vi.mocked(deleteReview).mockResolvedValue()
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    await user.selectOptions(await screen.findByLabelText('Puan'), '4')
    await user.type(screen.getByLabelText('Yorum'), review.comment)
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    expect(await screen.findByText('Değerlendirmen kaydedildi.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Değerlendirmeni düzenle' })).toBeInTheDocument()
    expect(saveReview).toHaveBeenCalledWith('token', 42, { rating: 4, comment: review.comment })
    await user.selectOptions(screen.getByLabelText('Puan'), '2')
    await user.clear(screen.getByLabelText('Yorum'))
    await user.type(screen.getByLabelText('Yorum'), edited.comment)
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Değerlendirme listesi' }))
      .toHaveTextContent(edited.comment))
    await user.click(screen.getByRole('button', { name: 'Değerlendirmemi sil' }))
    expect(await screen.findByText('Değerlendirmen silindi.')).toBeInTheDocument()
    expect(await screen.findByText('Henüz değerlendirme yok.')).toBeInTheDocument()
    expect(deleteReview).toHaveBeenCalledWith('token', 42)
  })

  it('shows save, permission and deletion failures without claiming success', async () => {
    vi.mocked(getReviews).mockResolvedValue({ ...empty, items: [review], my_review: review })
    vi.mocked(saveReview).mockRejectedValueOnce(new ApiError('Forbidden', 403))
      .mockRejectedValueOnce(new ApiError('Invalid', 422))
      .mockRejectedValueOnce(new Error('offline'))
    vi.mocked(deleteReview).mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    const save = await screen.findByRole('button', { name: 'Değerlendirmeyi kaydet' })
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('Yalnızca teslim aldığın')
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('yazdırılamayan karakter')
    await user.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('kaydedilemedi')
    await user.click(screen.getByRole('button', { name: 'Değerlendirmemi sil' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('silinemedi')
    expect(screen.queryByText('Değerlendirmen silindi.')).not.toBeInTheDocument()
  })

  it('explains a concurrent edit and lets the user refresh while preserving their draft', async () => {
    vi.mocked(getReviews).mockResolvedValue({ ...empty, items: [review], my_review: review })
    vi.mocked(saveReview).mockRejectedValue(new ApiError('Conflict', 409))
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    const field = await screen.findByLabelText('Yorum')
    await user.clear(field)
    await user.type(field, 'Değişiklik taslağım')
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('başka bir istekle değişti')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByLabelText('Yorum')).toHaveValue('Değişiklik taslağım')
    expect(getReviews).toHaveBeenCalledTimes(2)
  })

  it('paginates without losing a draft and returns when a page becomes empty', async () => {
    vi.mocked(getReviews)
      .mockResolvedValueOnce({ ...empty, items: [review], has_more: true })
      .mockResolvedValueOnce({ ...empty, items: [review], offset: 20 })
      .mockResolvedValueOnce({ ...empty, offset: 20 })
      .mockResolvedValueOnce(empty)
    vi.mocked(saveReview).mockResolvedValue(review)
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    await user.type(await screen.findByLabelText('Yorum'), 'Kaybolmayan taslak')
    await user.click(screen.getByRole('button', { name: 'Sonraki sayfa' }))
    await waitFor(() => expect(getReviews).toHaveBeenCalledWith('token', 42, 20, 20))
    expect(await screen.findByLabelText('Yorum')).toHaveValue('Kaybolmayan taslak')
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    expect(await screen.findByText('Henüz değerlendirme yok.')).toBeInTheDocument()
    expect(getReviews).toHaveBeenLastCalledWith('token', 42, 20, 0)
  })

  it('navigates to the previous page and shows loading errors instead of stale results', async () => {
    vi.mocked(getReviews).mockResolvedValueOnce({ ...empty, items: [review], has_more: true })
      .mockResolvedValueOnce({ ...empty, items: [review], offset: 20 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(empty)
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    await user.click(await screen.findByRole('button', { name: 'Sonraki sayfa' }))
    await user.click(await screen.findByRole('button', { name: 'Önceki sayfa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('yüklenemedi')
    expect(screen.queryByRole('list', { name: 'Değerlendirme listesi' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(await screen.findByText('Henüz değerlendirme yok.')).toBeInTheDocument()
  })

  it('lets a buyer delete their review even if the purchase is no longer eligible', async () => {
    vi.mocked(getReviews).mockResolvedValueOnce({ ...empty, items: [review], my_review: review, can_review: false })
      .mockResolvedValueOnce({ ...empty, can_review: false })
    vi.mocked(deleteReview).mockResolvedValue()
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    expect(await screen.findByText(/ürünü alıcı olarak teslim/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Değerlendirmemi sil' }))
    expect(await screen.findByText('Değerlendirmen silindi.')).toBeInTheDocument()
    expect(deleteReview).toHaveBeenCalledWith('token', 42)
  })

  it('does not offer deletion to a user without the buyer role', async () => {
    vi.mocked(getReviews).mockResolvedValue({ ...empty, items: [review], my_review: review, can_review: false })
    render(<ReviewsPanel token="token" productId={42} isBuyer={false} />)
    await screen.findByText(/ürünü alıcı olarak teslim/)
    expect(screen.queryByRole('button', { name: 'Değerlendirmemi sil' })).not.toBeInTheDocument()
  })

  it('validates trimmed Unicode character counts without truncating the draft', async () => {
    vi.mocked(getReviews).mockResolvedValue(empty)
    vi.mocked(saveReview).mockResolvedValue(review)
    const user = userEvent.setup()
    render(<ReviewsPanel token="token" productId={42} isBuyer />)
    const field = await screen.findByLabelText('Yorum')
    fireEvent.change(field, { target: { value: ` ${'🌟'.repeat(9)} ` } })
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('10 ile 1000')
    expect(saveReview).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '🌟'.repeat(1001) } })
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    expect(saveReview).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '🌟'.repeat(1000) } })
    await user.click(screen.getByRole('button', { name: 'Değerlendirmeyi kaydet' }))
    await waitFor(() => expect(saveReview).toHaveBeenCalledWith(
      'token', 42, { rating: 5, comment: '🌟'.repeat(1000) },
    ))
  })
})
