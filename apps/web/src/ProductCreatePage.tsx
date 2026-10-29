import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, createProduct, updateProduct } from './api'
import type { Product, ProductCreateRequest } from './api'

interface ProductCreatePageProps {
  product?: Product
  token: string
  onCancel: () => void
  onSaved: (product: Product) => void
}

function hasValidProductFields(product: ProductCreateRequest): boolean {
  const namePattern = /^[\p{L}\p{N}_]+(?:[ '-][\p{L}\p{N}_]+)*$/u
  const categoryPattern =
    /^[\p{L}\p{N}_]+(?:[ &/'’-][\p{L}\p{N}_]+)*$/u
  const nonPrintablePattern = /[\p{C}\p{Z}]/u
  const hasInvalidDescriptionCharacter = [...product.description].some(
    (character) =>
      character !== ' ' &&
      character !== '\n' &&
      character !== '\t' &&
      nonPrintablePattern.test(character),
  )
  const validPrice =
    /^\d+(?:\.\d{1,2})?$/.test(product.price) &&
    Number(product.price) >= 0.01 &&
    Number(product.price) <= 999999.99

  return (
    product.name.length >= 2 &&
    product.name.length <= 32 &&
    namePattern.test(product.name) &&
    product.category.length >= 2 &&
    product.category.length <= 40 &&
    categoryPattern.test(product.category) &&
    product.description.length >= 10 &&
    product.description.length <= 500 &&
    !hasInvalidDescriptionCharacter &&
    validPrice &&
    Number.isInteger(product.stock) &&
    product.stock >= 0 &&
    product.stock <= 999999
  )
}

function getErrorMessage(error: unknown, isEditing: boolean): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Oturum süren dolmuş. Çıkış yapıp yeniden giriş yap.'
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'Bu işlem için yönetici yetkisi gereklidir.'
  }
  if (error instanceof ApiError && error.status === 409) {
    return 'Bu ürün adı katalogda zaten kullanılıyor.'
  }
  if (error instanceof ApiError && error.status === 422) {
    return 'Ürün bilgilerini kontrol edip tekrar dene.'
  }
  if (error instanceof ApiError && error.status === 404 && isEditing) {
    return 'Düzenlenecek ürün bulunamadı. Ürün listesini yenileyip tekrar dene.'
  }
  if (error instanceof TypeError) {
    return 'Sunucuya bağlanılamadı. Backend servisinin çalıştığını kontrol et.'
  }
  return isEditing
    ? 'Ürün güncellenemedi. Lütfen tekrar dene.'
    : 'Ürün eklenemedi. Lütfen tekrar dene.'
}

export default function ProductCreatePage({
  product: productToEdit,
  token,
  onCancel,
  onSaved,
}: ProductCreatePageProps) {
  const [name, setName] = useState(productToEdit?.name ?? '')
  const [category, setCategory] = useState(productToEdit?.category ?? '')
  const [description, setDescription] = useState(productToEdit?.description ?? '')
  const [price, setPrice] = useState(productToEdit?.price ?? '')
  const [stock, setStock] = useState(
    productToEdit === undefined ? '' : String(productToEdit.stock),
  )
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = productToEdit !== undefined

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const product: ProductCreateRequest = {
      name: name.trim().replace(/\s+/g, ' ').normalize('NFC'),
      category: category.trim().replace(/\s+/g, ' ').normalize('NFC'),
      description: description.trim(),
      price,
      stock: stock === '' ? Number.NaN : Number(stock),
    }

    if (!hasValidProductFields(product)) {
      setError('Ürün bilgilerini kontrol edip tekrar dene.')
      return
    }

    setIsSubmitting(true)
    try {
      const savedProduct = isEditing
        ? await updateProduct(token, productToEdit.id, product)
        : await createProduct(token, product)
      onSaved(savedProduct)
    } catch (requestError) {
      setError(getErrorMessage(requestError, isEditing))
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
        <h1 id="create-product-heading">
          {isEditing ? 'Ürünü düzenle' : 'Yeni ürün ekle'}
        </h1>
        <p>
          {isEditing
            ? 'Ürün bilgilerini güncelleyerek mağaza kataloğunu düzenle.'
            : 'Ürün bilgilerini doldurarak mağaza kataloğuna ekle.'}
        </p>

        <form className="product-create-form" onSubmit={handleSubmit}>
          <label htmlFor="product-name">Ürün adı</label>
          <input
            autoComplete="off"
            id="product-name"
            maxLength={32}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            required
            title="Harf, rakam, boşluk, tire ve kesme işareti kullanın."
            value={name}
          />

          <label htmlFor="product-category">Kategori</label>
          <input
            autoComplete="off"
            id="product-category"
            maxLength={40}
            minLength={2}
            onChange={(event) => setCategory(event.target.value)}
            required
            title="Kategori biçimini kontrol edin."
            value={category}
          />

          <label htmlFor="product-description">Açıklama</label>
          <textarea
            id="product-description"
            maxLength={500}
            minLength={10}
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
                max="999999.99"
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
                max="999999"
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
              {isSubmitting
                ? isEditing
                  ? 'Ürün güncelleniyor...'
                  : 'Ürün ekleniyor...'
                : isEditing
                  ? 'Değişiklikleri kaydet'
                  : 'Ürünü kaydet'}
            </button>
          </div>
        </form>
      </section>
      <footer className="store-footer">© 2026 Liva <span>Senin için, özenle.</span></footer>
    </main>
  )
}
