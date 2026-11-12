import { useEffect, useRef, useState } from 'react'
import type { CustomerOrder, CustomerPayment } from './api'
import { ApiError, createPayment, createProductReturn, getMyOrders } from './api'

interface OrderHistoryPanelProps {
  token: string
  refreshVersion: number
  latestOrder: CustomerOrder | null
}

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(Number(value))
}

function orderStatusLabel(status: CustomerOrder['status']): string {
  switch (status) {
    case 'pending_payment':
      return 'Ödeme bekleniyor'
    case 'paid':
      return 'Ödendi'
    case 'processing':
      return 'Hazırlanıyor'
    case 'shipped':
      return 'Kargoya verildi'
    case 'delivered':
      return 'Teslim edildi'
    case 'cancelled':
      return 'İptal edildi'
  }
}

function historyActionLabel(action: string): string {
  switch (action) {
    case 'created':
      return 'Sipariş oluşturuldu'
    case 'payment_succeeded':
      return 'Ödeme alındı'
    case 'payment_failed':
      return 'Ödeme başarısız oldu'
    case 'payment_cancelled':
      return 'Ödeme iptal edildi'
    case 'payment_expired':
      return 'Ödeme süresi doldu'
    case 'admin_status_changed':
      return 'Sipariş durumu güncellendi'
    case 'admin_refund':
      return 'Sipariş iptal edildi ve iade kaydı oluşturuldu'
    case 'legacy_import':
      return 'Sipariş durumu kaydı içe aktarıldı'
    default:
      return 'Sipariş güncellendi'
  }
}

function canReturnOrder(order: CustomerOrder): boolean {
  if (order.status !== 'shipped' && order.status !== 'delivered') return false
  const transition = [...order.history].reverse().find(
    (event) => event.action === 'admin_status_changed' && event.to_status === order.status,
  )
  if (!transition) return false
  const elapsed = Date.now() - new Date(transition.created_at).getTime()
  return elapsed >= 0 && elapsed <= 30 * 24 * 60 * 60 * 1000
}

function returnedQuantity(order: CustomerOrder, orderItemId: number): number {
  return (order.returns ?? [])
    .filter((productReturn) => productReturn.order_item_id === orderItemId)
    .reduce((total, productReturn) => total + productReturn.quantity, 0)
}

export default function OrderHistoryPanel({
  token,
  refreshVersion,
  latestOrder,
}: OrderHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [startingPaymentOrderId, setStartingPaymentOrderId] = useState<number | null>(null)
  const [paymentsByOrder, setPaymentsByOrder] = useState<Record<number, CustomerPayment>>({})
  const [paymentErrors, setPaymentErrors] = useState<Record<number, string>>({})
  const [returningItem, setReturningItem] = useState<{
    orderId: number
    itemId: number
    maxQuantity: number
  } | null>(null)
  const [returnQuantity, setReturnQuantity] = useState('1')
  const [returnReason, setReturnReason] = useState('')
  const [returningOrderId, setReturningOrderId] = useState<number | null>(null)
  const [returnError, setReturnError] = useState('')
  const [returnNotice, setReturnNotice] = useState('')
  const [returnNoticeOrderId, setReturnNoticeOrderId] = useState<number | null>(null)
  const returnIdempotencyKeys = useRef<Record<string, string>>({})

  async function startPayment(orderId: number) {
    setStartingPaymentOrderId(orderId)
    setPaymentErrors((current) => ({ ...current, [orderId]: '' }))
    try {
      const payment = await createPayment(token, orderId, `order-${orderId}-payment`)
      setPaymentsByOrder((current) => ({ ...current, [orderId]: payment }))
    } catch {
      setPaymentErrors((current) => ({
        ...current,
        [orderId]: 'Ödeme başlatılamadı. Lütfen tekrar dene.',
      }))
    } finally {
      setStartingPaymentOrderId(null)
    }
  }

  async function submitProductReturn(
    order: CustomerOrder,
    itemId: number,
  ) {
    const quantity = Number(returnQuantity)
    const reason = returnReason.trim()
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > (returningItem?.maxQuantity ?? 0) ||
      reason.length < 5
    ) {
      setReturnError('İade miktarı ve en az 5 karakterlik nedeni kontrol et.')
      return
    }

    const requestBody = { order_item_id: itemId, quantity, reason }
    const intent = JSON.stringify([order.id, requestBody])
    const idempotencyKey = returnIdempotencyKeys.current[intent] ??= globalThis.crypto.randomUUID()
    setReturningOrderId(order.id)
    setReturnError('')
    setReturnNotice('')
    try {
      const createdReturn = await createProductReturn(
        token,
        order.id,
        requestBody,
        idempotencyKey,
      )
      delete returnIdempotencyKeys.current[intent]
      setOrders((current) =>
        current.map((currentOrder) => {
          if (currentOrder.id !== order.id) return currentOrder
          const returns = currentOrder.returns ?? []
          return {
            ...currentOrder,
            returns: returns.some((productReturn) => productReturn.id === createdReturn.id)
              ? returns
              : [...returns, createdReturn],
          }
        }),
      )
      setReturnNotice(
        `İade talebin otomatik onaylandı. Yerel iade tutarı: ${formatCurrency(createdReturn.refund_amount)}. Gerçek para transferi yapılmadı.`,
      )
      setReturnNoticeOrderId(order.id)
      setReturningItem(null)
      setReturnQuantity('1')
      setReturnReason('')
    } catch (requestError) {
      setReturnError(
        requestError instanceof ApiError
          ? requestError.message
          : 'İade talebi gönderilemedi. Bağlantıyı kontrol edip tekrar dene.',
      )
    } finally {
      setReturningOrderId(null)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    let active = true
    getMyOrders(token)
      .then((response) => {
        if (active) setOrders(response)
      })
      .catch(() => {
        if (active) setError('Sipariş geçmişi yüklenemedi. Lütfen tekrar dene.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, refreshVersion, retryCount, token])

  return (
    <section className="order-history-section">
      {latestOrder && (
        <p className="order-confirmation" role="status">
          Siparişin oluşturuldu: #{latestOrder.id}. Ödeme adımı bekleniyor.
        </p>
      )}
      <button
        aria-expanded={isOpen}
        className="order-history-toggle"
        onClick={() => {
          const nextOpen = !isOpen
          setIsOpen(nextOpen)
          if (nextOpen) {
            setIsLoading(true)
            setError('')
          }
        }}
        type="button"
      >
        Siparişlerim
      </button>
      {isOpen && (
        <div aria-labelledby="order-history-heading" className="order-history-panel">
          <div className="order-history-panel-heading">
            <h2 id="order-history-heading">Sipariş geçmişim</h2>
            <button
              className="retry-button"
              onClick={() => {
                setIsLoading(true)
                setError('')
                setRetryCount((count) => count + 1)
              }}
              type="button"
            >
              Yenile
            </button>
          </div>
          {error && (
            <div className="products-error" role="alert">
              <p>{error}</p>
              <button
                className="retry-button"
                onClick={() => {
                  setIsLoading(true)
                  setError('')
                  setRetryCount((count) => count + 1)
                }}
                type="button"
              >
                Tekrar dene
              </button>
            </div>
          )}
          {isLoading ? (
            <p className="products-status" role="status">Siparişler yükleniyor...</p>
          ) : orders.length === 0 ? (
            !error && <p className="products-status">Henüz siparişin yok.</p>
          ) : (
            <ul aria-label="Sipariş geçmişi" className="order-history-list">
              {orders.map((order) => (
                <li className="order-history-item" key={order.id}>
                  <div className="order-history-summary">
                    <h3>Sipariş #{order.id}</h3>
                    <span>{orderStatusLabel(order.status)}</span>
                  </div>
                  <time dateTime={order.created_at}>
                    {new Date(order.created_at).toLocaleString('tr-TR')}
                  </time>
                  {order.history.length > 0 && (
                    <ol aria-label={`Sipariş ${order.id} durum geçmişi`} className="order-status-history">
                      {order.history.map((event, index) => (
                        <li key={`${event.action}-${event.created_at}-${index}`}>
                          <span>{historyActionLabel(event.action)}</span>
                          <time dateTime={event.created_at}>
                            {new Date(event.created_at).toLocaleString('tr-TR')}
                          </time>
                          {event.reason && <p>{event.reason}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {order.fulfillments.length > 0 && (
                    <section
                      aria-label={`Sipariş ${order.id} satıcı paketleri`}
                      className="order-fulfillment-list"
                    >
                      <h4>Satıcı paketleri</h4>
                      {order.fulfillments.map((fulfillment) => (
                        <article key={fulfillment.id}>
                          <div className="order-history-summary">
                            <strong>{fulfillment.store_name}</strong>
                            <span>{orderStatusLabel(fulfillment.status)}</span>
                          </div>
                          <ul>
                            {fulfillment.items.map((item) => (
                              <li key={item.id}>
                                {item.product_name} · {item.quantity} adet
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </section>
                  )}
                  <ul aria-label={`Sipariş ${order.id} kalemleri`}>
                    {order.items.map((item) => {
                      const remainingQuantity = item.quantity - returnedQuantity(order, item.id)
                      const isReturningThisItem =
                        returningItem?.orderId === order.id && returningItem.itemId === item.id
                      return (
                        <li key={item.id}>
                          <span>
                            {item.product_name} · {item.quantity} adet · {formatCurrency(item.line_total)}
                          </span>
                          {canReturnOrder(order) && remainingQuantity > 0 && (
                            <div className="order-return-action">
                              {!isReturningThisItem ? (
                                <button
                                  className="retry-button"
                                  onClick={() => {
                                    setReturningItem({
                                      orderId: order.id,
                                      itemId: item.id,
                                      maxQuantity: remainingQuantity,
                                    })
                                    setReturnQuantity('1')
                                    setReturnReason('')
                                    setReturnError('')
                                  }}
                                  type="button"
                                >
                                  İade et {item.product_name}
                                </button>
                              ) : (
                                <div className="order-return-form">
                                  <label>
                                    İade miktarı (en fazla {remainingQuantity})
                                    <input
                                      max={remainingQuantity}
                                      min="1"
                                      onChange={(event) => setReturnQuantity(event.target.value)}
                                      type="number"
                                      value={returnQuantity}
                                    />
                                  </label>
                                  <label>
                                    İade nedeni
                                    <textarea
                                      maxLength={500}
                                      minLength={5}
                                      onChange={(event) => setReturnReason(event.target.value)}
                                      value={returnReason}
                                    />
                                  </label>
                                  <p>Yerel test kaydıdır; gerçek para transferi veya kargo işlemi yapılmaz.</p>
                                  {returnError && <p role="alert">{returnError}</p>}
                                  <button
                                    className="checkout-button"
                                    disabled={returningOrderId === order.id}
                                    onClick={() => void submitProductReturn(order, item.id)}
                                    type="button"
                                  >
                                    {returningOrderId === order.id ? 'İade kaydediliyor...' : 'İade talebini gönder'}
                                  </button>
                                  <button
                                    className="retry-button"
                                    onClick={() => {
                                      setReturningItem(null)
                                      setReturnError('')
                                    }}
                                    type="button"
                                  >
                                    İptal
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {(order.returns ?? []).length > 0 && (
                    <ul aria-label={`Sipariş ${order.id} iadeleri`} className="order-return-list">
                      {(order.returns ?? []).map((productReturn) => (
                        <li key={productReturn.id}>
                          {productReturn.product_name} · {productReturn.quantity} adet ·
                          {' '}{formatCurrency(productReturn.refund_amount)} · Otomatik onaylandı
                          <p>{productReturn.reason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {returnNotice && returnNoticeOrderId === order.id && (
                    <p className="order-return-notice" role="status">{returnNotice}</p>
                  )}
                  {order.shipping_address && (
                    <section className="order-delivery-snapshot" aria-label="Sipariş teslimat bilgileri">
                      <h4>Teslimat adresi</h4>
                      <p>
                        {order.shipping_address.recipient_name} · {order.shipping_address.phone}
                      </p>
                      <p>
                        {order.shipping_address.address_line}, {order.shipping_address.district},{' '}
                        {order.shipping_address.city}
                        {order.shipping_address.postal_code
                          ? ` · ${order.shipping_address.postal_code}`
                          : ''}
                      </p>
                      {order.delivery_method && (
                        <p>
                          {order.delivery_method === 'express' ? 'Hızlı' : 'Standart'} teslimat ·{' '}
                          {formatCurrency(order.delivery_fee)}
                        </p>
                      )}
                    </section>
                  )}
                  {order.delivery_method && (
                    <p>
                      Ürün ara toplamı: <strong>{formatCurrency(order.item_subtotal)}</strong>
                    </p>
                  )}
                  <p>
                    Toplam: <strong>{formatCurrency(order.total_amount)}</strong>
                  </p>
                  {order.status === 'pending_payment' && (
                    <div className="order-payment-action">
                      <button
                        className="checkout-button"
                        disabled={startingPaymentOrderId === order.id}
                        onClick={() => void startPayment(order.id)}
                        type="button"
                      >
                        {startingPaymentOrderId === order.id
                          ? 'Ödeme başlatılıyor...'
                          : 'Ödemeye devam et'}
                      </button>
                      {paymentErrors[order.id] && (
                        <p className="cart-error" role="alert">{paymentErrors[order.id]}</p>
                      )}
                      {paymentsByOrder[order.id]?.checkout_url && (
                        <a
                          className="payment-checkout-link"
                          href={paymentsByOrder[order.id].checkout_url ?? undefined}
                        >
                          Güvenli test ödeme sayfasına git
                        </a>
                      )}
                      {paymentsByOrder[order.id] && (
                        <p className="payment-expiry-note">
                          Ödeme süresi: {new Date(
                            paymentsByOrder[order.id].expires_at,
                          ).toLocaleTimeString('tr-TR')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
