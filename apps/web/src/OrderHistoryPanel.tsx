import { useEffect, useState } from 'react'
import type { CustomerOrder } from './api'
import { getMyOrders } from './api'

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
    case 'cancelled':
      return 'İptal edildi'
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
          <h2 id="order-history-heading">Sipariş geçmişim</h2>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
