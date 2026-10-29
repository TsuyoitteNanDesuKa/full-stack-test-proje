import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, createProduct } from './api'
import type { Product, ProductCreateRequest } from './api'

interface ProductCreatePageProps {
  token: string
  onCancel: () => void
  onCreated: (product: Product) => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Oturum süren dolmuş. Çıkış yapıp yeniden giriş yap.'
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'Bu işlem için yönetici yetkisi gereklidir.'
  }
  if (error instanceof ApiError && error.status === 422) {
    return 'Ürün bilgilerini kontrol edip tekrar dene.'
  }
  if (error instanceof TypeError) {
    return 'Sunucuya bağlanılamadı. Backend servisinin çalıştığını kontrol et.'
  }
  return 'Ürün eklenemedi. Lütfen tekrar dene.'
}

export default function ProductCreatePage({
  token,
  onCancel,
  onCreated,
}: ProductCreatePageProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const product: ProductCreateRequest = {
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      price,
      stock: Number(stock),
    }

    try {
      const createdProduct = await createProduct(token, product)
      onCreated(createdProduct)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="store-home product-create-page">
      <header className="store-header">
        <a className="brand store-brand" href="/" aria-label="Liva ana sayfa">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span>liva</span>
        </a>
        <button className="logout-button" onClick={onCancel} type="button">
          Ürün listesine dön
        </button>
      </header>

      <section aria-labelledby="create-product-heading" className="product-create-content">
        <span className="products-kicker">YÖNETİCİ PANELİ</span>
        <h1 id="create-product-heading">Yeni ürün ekle</h1>
        <p>Ürün bilgilerini doldurarak mağaza kataloğuna ekle.</p>

        <form className="product-create-form" onSubmit={handleSubmit}>
          <label htmlFor="product-name">Ürün adı</label>
          <input
            autoComplete="off"
            id="product-name"
            maxLength={120}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />

          <label htmlFor="product-category">Kategori</label>
          <input
            autoComplete="off"
            id="product-category"
            maxLength={80}
            minLength={2}
            onChange={(event) => setCategory(event.target.value)}
            required
            value={category}
          />

          <label htmlFor="product-description">Açıklama</label>
          <textarea
            id="product-description"
            maxLength={600}
            onChange={(event) => setDescription(event.target.value)}
            required
            rows={4}
            value={description}
          />

          <div className="product-form-numbers">
            <div>
              <label htmlFor="product-price">Fiyat (TL)</label>
              <input
                id="product-price"
                min="0.01"
                onChange={(event) => setPrice(event.target.value)}
                required
                step="0.01"
                type="number"
                value={price}
              />
            </div>
            <div>
              <label htmlFor="product-stock">Stok adedi</label>
              <input
                id="product-stock"
                min="0"
                onChange={(event) => setStock(event.target.value)}
                required
                step="1"
                type="number"
                value={stock}
              />
            </div>
          </div>

          {error && <p className="form-error product-form-error" role="alert">{error}</p>}

          <div className="product-form-actions">
            <button className="retry-button" onClick={onCancel} type="button">
              İptal
            </button>
            <button className="submit-button product-submit-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Ürün ekleniyor...' : 'Ürünü kaydet'}
            </button>
          </div>
        </form>
      </section>
      <footer className="store-footer">© 2026 Liva <span>Senin için, özenle.</span></footer>
    </main>
  )
}
