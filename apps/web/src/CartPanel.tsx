import { useState } from 'react'
import type { FormEvent } from 'react'
import { deliveryPricing } from './api'
import type { CartItem, CartResponse, CustomerAddress, DeliveryMethod } from './api'

interface CartPanelProps {
  cart: CartResponse | null
  isLoading: boolean
  isMutating: boolean
  isCheckingOut: boolean
  error: string
  isOpen: boolean
  addresses: CustomerAddress[]
  isAddressLoading: boolean
  selectedAddressId: number | null
  deliveryMethod: DeliveryMethod
  onToggle: () => void
  onManageAddresses: () => void
  onSelectAddress: (addressId: number | null) => void
  onSelectDeliveryMethod: (method: DeliveryMethod) => void
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
  addresses,
  isAddressLoading,
  selectedAddressId,
  deliveryMethod,
  onToggle,
  onManageAddresses,
  onSelectAddress,
  onSelectDeliveryMethod,
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
  const itemSubtotal = Number(cart?.subtotal ?? '0')
  const deliveryFee = deliveryMethod === 'standard' &&
      itemSubtotal >= deliveryPricing.freeStandardThreshold
    ? 0
    : deliveryMethod === 'standard'
      ? deliveryPricing.standardFee
      : deliveryPricing.expressFee
  const formattedDeliveryFee = deliveryFee === 0
    ? 'Ücretsiz'
    : new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
      }).format(deliveryFee)
  const total = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(itemSubtotal + deliveryFee)

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
                <span>Ürün ara toplamı</span>
                <strong>{subtotal}</strong>
              </div>
              <div className="checkout-delivery-options">
                <h3>Teslimat adresi ve seçeneği</h3>
                <label>
                  Kayıtlı adres
                  <select
                    aria-label="Teslimat adresi"
                    disabled={isAddressLoading || addresses.length === 0}
                    onChange={(event) =>
                      onSelectAddress(event.target.value ? Number(event.target.value) : null)
                    }
                    value={selectedAddressId ?? ''}
                  >
                    <option value="">Adres seç</option>
                    {addresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label} · {address.district}, {address.city}
                        {address.is_default ? ' · Varsayılan' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="retry-button" onClick={onManageAddresses} type="button">
                  Adreslerimi yönet
                </button>
                {addresses.length === 0 && !isAddressLoading && (
                  <p role="status">Sipariş için önce bir teslimat adresi ekle.</p>
                )}
                <fieldset className="delivery-method-options">
                  <legend>Teslimat hızı</legend>
                  <label>
                    <input
                      checked={deliveryMethod === 'standard'}
                      name="delivery-method"
                      onChange={() => onSelectDeliveryMethod('standard')}
                      type="radio"
                      value="standard"
                    />
                    Standart · {itemSubtotal >= deliveryPricing.freeStandardThreshold
                      ? 'Ücretsiz'
                      : '₺49,90'}
                  </label>
                  <label>
                    <input
                      checked={deliveryMethod === 'express'}
                      name="delivery-method"
                      onChange={() => onSelectDeliveryMethod('express')}
                      type="radio"
                      value="express"
                    />
                    Hızlı · ₺89,90
                  </label>
                </fieldset>
                <p className="delivery-policy-note">
                  Ürün ara toplamı ₺1.000,00 ve üzerindeyse Standart ücretsizdir. Ürün iadeleri
                  teslimat ücretini kapsamaz.
                </p>
              </div>
              <div className="cart-subtotal">
                <span>Teslimat</span>
                <strong>{formattedDeliveryFee}</strong>
              </div>
              <div className="cart-subtotal">
                <span>Sipariş toplamı</span>
                <strong>{total}</strong>
              </div>
              <p className="cart-price-note">
                Fiyatlar güncel katalog fiyatlarına göre gösterilir.
              </p>
              <button
                className="checkout-button"
                disabled={
                  isMutating ||
                  isCheckingOut ||
                  isAddressLoading ||
                  selectedAddressId === null ||
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
