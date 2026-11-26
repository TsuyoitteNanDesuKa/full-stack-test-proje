import { useEffect, useState } from 'react'
import { addFavorite, ApiError, getProduct } from './api'
import type { Product } from './api'
import ReviewsPanel from './ReviewsPanel'

interface ProductDetailPanelProps {
  token: string
  productId: number
  isBuyer: boolean
  addedToCart: boolean
  cartMessage: string
  isAdding: boolean
  isCartBusy?: boolean
  onAddToCart: (product: Product) => void | Promise<void>
  onBack: () => void
}

const formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

export default function ProductDetailPanel({
  token,
  productId,
  isBuyer,
  addedToCart,
  cartMessage,
  isAdding,
  isCartBusy = false,
  onAddToCart,
  onBack,
}: ProductDetailPanelProps) {
  const [product, setProduct] = useState<Product | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')
  const [retryCount, setRetryCount] = useState(0)
  const [favoriteStatus, setFavoriteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [reviewsOpen, setReviewsOpen] = useState(false)

  async function handleFavorite() {
    setFavoriteStatus('loading')
    try {
      await addFavorite(token, productId)
      setFavoriteStatus('success')
    } catch {
      setFavoriteStatus('error')
    }
  }

  useEffect(() => {
    let active = true
    getProduct(token, productId)
      .then((loaded) => {
        if (!active) return
        setProduct(loaded)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setProduct(null)
        setStatus(error instanceof ApiError && error.status === 404 ? 'not-found' : 'error')
      })
    return () => {
      active = false
    }
  }, [token, productId, retryCount])

  return (
    <main className="store-home product-detail-page">
      <button className="retry-button" onClick={onBack} type="button">
        Kataloğa dön
      </button>

      {status === 'loading' && (
        <p className="products-status" role="status">Ürün yükleniyor...</p>
      )}

      {status === 'not-found' && (
        <p className="store-empty" role="alert">Ürün bulunamadı.</p>
      )}

      {status === 'error' && (
        <div className="products-error" role="alert">
          <p>Ürün bilgisi alınamadı. Lütfen tekrar dene.</p>
          <button className="retry-button" onClick={() => setRetryCount((c) => c + 1)} type="button">
            Tekrar dene
          </button>
        </div>
      )}

      {status === 'ready' && product && (
        <article aria-labelledby="product-detail-name">
          <span className="product-category">{product.category}</span>
          <h1 id="product-detail-name">{product.name}</h1>
          <p>{product.description}</p>
          <p className="product-price">{formatter.format(Number(product.price))}</p>
          {isBuyer && (
            <div>
              <button
                className="retry-button"
                disabled={favoriteStatus === 'loading'}
                onClick={() => void handleFavorite()}
                type="button"
              >
                {favoriteStatus === 'loading' ? 'Favorilere ekleniyor...' : 'Favorilere ekle'}
              </button>
              {favoriteStatus === 'success' && (
                <p className="application-notice" role="status">Ürün favorilerine eklendi.</p>
              )}
              {favoriteStatus === 'error' && (
                <p className="products-error" role="alert">Ürün favorilere eklenemedi. Lütfen tekrar dene.</p>
              )}
            </div>
          )}
          {product.stock > 0 ? (
            <>
              <p className="products-count">Stok: {product.stock}</p>
              <button
                className="checkout-button"
                disabled={isAdding || isCartBusy}
                onClick={() => void onAddToCart(product)}
                type="button"
              >
                {isAdding ? 'Sepete ekleniyor...' : 'Sepete ekle'}
              </button>
              {addedToCart && (
                <p className="application-notice" role="status">Ürün sepetine eklendi.</p>
              )}
              {cartMessage && (
                <p className="products-error" role="alert">{cartMessage}</p>
              )}
            </>
          ) : (
            <p className="products-status" role="status">Bu ürün şu anda stokta yok.</p>
          )}
          <button
            aria-expanded={reviewsOpen}
            className="retry-button"
            onClick={() => setReviewsOpen((open) => !open)}
            type="button"
          >
            {reviewsOpen ? 'Değerlendirmeleri kapat' : 'Değerlendirmeleri göster'}
          </button>
          {reviewsOpen && <ReviewsPanel token={token} productId={productId} isBuyer={isBuyer} />}
        </article>
      )}
    </main>
  )
}
