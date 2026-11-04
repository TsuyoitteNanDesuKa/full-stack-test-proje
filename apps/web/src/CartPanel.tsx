import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CartItem, CartResponse } from './api'

interface CartPanelProps {
  cart: CartResponse | null
  isLoading: boolean
  isMutating: boolean
  isCheckingOut: boolean
  error: string
  isOpen: boolean
  onToggle: () => void
  onRetry: () => void
  onUpdate: (itemId: number, quantity: number) => Promise<void>
  onRemove: (itemId: number) => Promise<void>
  onCheckout: () => Promise<void>
}

function CartItemRow({
  item,
  isMutating,
  onUpdate,
  onRemove,
}: {
  item: CartItem
  isMutating: boolean
  onUpdate: (itemId: number, quantity: number) => Promise<void>
  onRemove: (itemId: number) => Promise<void>
}) {
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [validationError, setValidationError] = useState('')
  const canChangeQuantity = item.product_id !== null && (item.available_stock ?? 0) > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError('')
    const nextQuantity = Number(quantity)
    if (
      !Number.isInteger(nextQuantity) ||
      nextQuantity < 1 ||
      (item.available_stock !== null && nextQuantity > item.available_stock)
    ) {
      setValidationError('Miktar mevcut stok içinde olmalıdır.')
      return
    }
    await onUpdate(item.id, nextQuantity)
  }

  return (
    <li className="cart-item">
      <div className="cart-item-heading">
        <h3>{item.product_name}</h3>
        <span className="cart-item-price">
          {item.unit_price === null
            ? '—'
            : new Intl.NumberFormat('tr-TR', {
                style: 'currency',
                currency: 'TRY',
              }).format(Number(item.unit_price))}
        </span>
      </div>
      {!item.is_available && (
        <p className="cart-item-unavailable" role="status">
          {item.product_id === null
            ? 'Ürün artık mevcut değil.'
            : `Stok yetersiz. Mevcut stok: ${item.available_stock ?? 0}.`}
        </p>
      )}
      <form className="cart-item-actions" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Miktar
          <input
            aria-label={`Miktar: ${item.product_name}`}
            disabled={!canChangeQuantity || isMutating}
            max={item.available_stock ?? 999999}
            min="1"
            onChange={(event) => setQuantity(event.target.value)}
            step="1"
            type="number"
            value={quantity}
          />
        </label>
        <button
          className="retry-button"
          disabled={!canChangeQuantity || isMutating}
          type="submit"
        >
          Miktarı güncelle
        </button>
        <button
          className="delete-product-button"
          disabled={isMutating}
          onClick={() => void onRemove(item.id)}
          type="button"
        >
          Sepetten kaldır
        </button>
      </form>
      {validationError && <p className="cart-error" role="alert">{validationError}</p>}
    </li>
  )
}

export default function CartPanel({
  cart,
  isLoading,
  isMutating,
  isCheckingOut,
  error,
  isOpen,
  onToggle,
  onRetry,
  onUpdate,
  onRemove,
  onCheckout,
}: CartPanelProps) {
  const itemCount = cart?.items.reduce((count, item) => count + item.quantity, 0) ?? 0
  const subtotal = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(Number(cart?.subtotal ?? '0'))

  return (
    <section className="cart-section">
      <button
        aria-expanded={isOpen}
        className="cart-toggle"
        onClick={onToggle}
        type="button"
      >
        Sepet ({itemCount})
      </button>
      {isOpen && (
        <div aria-labelledby="cart-heading" className="cart-panel">
          <div className="cart-panel-heading">
            <div>
              <span className="products-kicker">ALIŞVERİŞİN</span>
              <h2 id="cart-heading">Sepetim</h2>
            </div>
            <span className="products-count">{itemCount} adet</span>
          </div>
          {error && (
            <div className="products-error" role="alert">
              <p>{error}</p>
              <button className="retry-button" onClick={onRetry} type="button">
                Tekrar dene
              </button>
            </div>
          )}
          {isLoading ? (
            <p className="products-status" role="status">Sepet yükleniyor...</p>
          ) : cart === null ? (
            !error && <p className="products-status">Sepet bilgisi alınamadı.</p>
          ) : cart.items.length === 0 ? (
            <div className="store-empty cart-empty">
              <span aria-hidden="true">✳</span>
              <p>Sepetin henüz boş.</p>
              <small>Beğendiğin ürünleri sepete ekleyebilirsin.</small>
            </div>
          ) : (
            <>
              <ul aria-label="Sepet ürünleri" className="cart-items">
                {cart.items.map((item) => (
                  <CartItemRow
                    isMutating={isMutating}
                    item={item}
                    key={`${item.id}-${item.quantity}`}
                    onRemove={onRemove}
                    onUpdate={onUpdate}
                  />
                ))}
              </ul>
              <div className="cart-subtotal">
                <span>Ara toplam</span>
                <strong>{subtotal}</strong>
              </div>
              <p className="cart-price-note">
                Fiyatlar güncel katalog fiyatlarına göre gösterilir.
              </p>
              <button
                className="checkout-button"
                disabled={
                  isMutating ||
                  isCheckingOut ||
                  cart.items.some((item) => !item.is_available)
                }
                onClick={() => void onCheckout()}
                type="button"
              >
                {isCheckingOut ? 'Sipariş oluşturuluyor...' : 'Siparişi oluştur'}
              </button>
              <p className="cart-price-note">
                Bu adımda ödeme alınmaz; siparişin ödeme adımı bekleniyor.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
