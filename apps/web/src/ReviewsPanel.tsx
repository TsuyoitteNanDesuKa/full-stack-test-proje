import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, deleteReview, getReviews, saveReview } from './api'
import type { ProductReviewPage } from './api'

const pageSize = 20
const conflictMessage = 'Değerlendirme başka bir istekle değişti. Listeyi yenileyip tekrar dene.'

export default function ReviewsPanel({
  token, productId, isBuyer,
}: {
  token: string
  productId: number
  isBuyer: boolean
}) {
  const [page, setPage] = useState<ProductReviewPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    let active = true
    getReviews(token, productId, pageSize, offset)
      .then((result) => {
        if (!active) return
        if (result.items.length === 0 && offset > 0) {
          setOffset(Math.max(0, offset - pageSize))
          return
        }
        if (!initialized.current) {
          setRating(result.my_review?.rating ?? 5)
          setComment(result.my_review?.comment ?? '')
          initialized.current = true
        }
        setPage(result)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPage(null)
        setLoading(false)
        setError('Değerlendirmeler yüklenemedi. Lütfen tekrar dene.')
      })
    return () => { active = false }
  }, [token, productId, offset, refresh])

  function reload() {
    setError('')
    setLoading(true)
    setRefresh((value) => value + 1)
  }

  function changePage(next: number) {
    setError('')
    setLoading(true)
    setOffset(next)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    const length = Array.from(comment.trim()).length
    if (length < 10 || length > 1000) {
      setError('Yorum 10 ile 1000 karakter arasında olmalıdır.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveReview(token, productId, { rating, comment })
      setRating(saved.rating)
      setComment(saved.comment)
      setNotice('Değerlendirmen kaydedildi.')
      reload()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) {
        setError('Yalnızca teslim aldığın ürünü değerlendirebilirsin.')
      } else if (failure instanceof ApiError && failure.status === 409) {
        setError(conflictMessage)
      } else if (failure instanceof ApiError && failure.status === 422) {
        setError('Yorum 10–1000 karakter olmalı ve yazdırılamayan karakter içermemelidir.')
      } else {
        setError('Değerlendirme kaydedilemedi. Lütfen tekrar dene.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await deleteReview(token, productId)
      setRating(5)
      setComment('')
      setNotice('Değerlendirmen silindi.')
      reload()
    } catch {
      setError('Değerlendirme silinemedi. Lütfen tekrar dene.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Ürün değerlendirmeleri">
      <h2>Ürün değerlendirmeleri</h2>
      {loading && <p role="status">Değerlendirmeler yükleniyor...</p>}
      {error && (
        <div className="products-error" role="alert">
          <p>{error}</p>
          {(!page || error === conflictMessage) && (
            <button className="retry-button" onClick={reload} type="button">Tekrar dene</button>
          )}
        </div>
      )}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {page && !loading && (
        <>
          {page.items.length === 0 ? <p>Henüz değerlendirme yok.</p> : (
            <ul aria-label="Değerlendirme listesi">
              {page.items.map((review) => (
                <li key={review.id}>
                  <p>{review.rating}/5 {review.is_mine && '(Senin değerlendirmen)'}</p>
                  <p className="review-comment">{review.comment}</p>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Değerlendirme sayfaları">
            <button className="retry-button" disabled={offset === 0 || saving} onClick={() => changePage(offset - pageSize)} type="button">
              Önceki sayfa
            </button>
            <button className="retry-button" disabled={!page.has_more || saving} onClick={() => changePage(offset + pageSize)} type="button">
              Sonraki sayfa
            </button>
          </nav>
          {page.can_review ? (
            <form className="address-form" onSubmit={(event) => void submit(event)}>
              <h3>{page.my_review ? 'Değerlendirmeni düzenle' : 'Değerlendirme yaz'}</h3>
              <label>
                Puan
                <select value={rating} onChange={(event) => setRating(Number(event.target.value))} disabled={saving}>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Yorum
                <textarea required aria-describedby="review-comment-help" value={comment}
                  onChange={(event) => setComment(event.target.value)} disabled={saving} />
              </label>
              <p id="review-comment-help">Yorum 10–1000 karakter olmalıdır.</p>
              <button className="retry-button" disabled={saving} type="submit">
                {saving ? 'İşleniyor...' : 'Değerlendirmeyi kaydet'}
              </button>
            </form>
          ) : <p>Değerlendirme yazmak için ürünü alıcı olarak teslim almış olmalısın.</p>}
          {isBuyer && page.my_review && (
            <button className="retry-button" disabled={saving} onClick={() => void remove()} type="button">
              Değerlendirmemi sil
            </button>
          )}
        </>
      )}
    </section>
  )
}
