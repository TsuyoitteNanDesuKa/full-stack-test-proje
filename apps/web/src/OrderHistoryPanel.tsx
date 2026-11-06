import { useEffect, useState } from 'react'
import type { CustomerOrder, CustomerPayment } from './api'
import { createPayment, getMyOrders } from './api'

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
                  <ul aria-label={`Sipariş ${order.id} kalemleri`}>
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.product_name} · {item.quantity} adet · {formatCurrency(item.line_total)}
                      </li>
                    ))}
                  </ul>
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
