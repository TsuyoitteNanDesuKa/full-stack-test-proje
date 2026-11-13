import { useCallback, useEffect, useState } from 'react'
import { getSellerOrders, updateSellerOrderStatus } from './api'
import type { OrderFulfillmentStatus, OrderStatus, SellerOrder } from './api'

const statusLabels: Record<OrderStatus, string> = {
  pending_payment: 'Ödeme bekleniyor',
  paid: 'Ödendi',
  processing: 'Hazırlanıyor',
  shipped: 'Gönderildi',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
}

const nextStatuses: Partial<Record<OrderStatus, OrderFulfillmentStatus>> = {
  paid: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
}

const nextStatusLabels: Record<OrderFulfillmentStatus, string> = {
  processing: 'Hazırlanmaya al',
  shipped: 'Gönderildi olarak işaretle',
  delivered: 'Teslim edildi olarak işaretle',
}

function fulfillmentEventLabel(action: string): string {
  switch (action) {
    case 'created':
      return 'Satıcı paketi oluşturuldu'
    case 'payment_succeeded':
      return 'Ödeme onaylandı'
    case 'seller_status_changed':
      return 'Satıcı paket durumunu güncelledi'
    case 'admin_status_changed':
      return 'Yönetici paket durumunu güncelledi'
    case 'admin_refund':
    case 'buyer_cancelled':
      return 'Paket iptal edildi'
    case 'legacy_import':
      return 'Önceki paket kaydı'
    default:
      return 'Paket durumu güncellendi'
  }
}

export default function SellerOrdersPanel({ token }: { token: string }) {
  const [orders, setOrders] = useState<SellerOrder[] | null>(null)
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      const loaded = await getSellerOrders(token)
      if (!Array.isArray(loaded)) throw new TypeError('Invalid seller orders response.')
      setOrders(loaded)
      setError('')
    } catch {
      setOrders([])
      setError('Satıcı siparişleri yüklenemedi. Lütfen tekrar dene.')
    }
  }, [token])

  useEffect(() => {
    let active = true
    getSellerOrders(token)
      .then((loaded) => {
        if (!Array.isArray(loaded)) throw new TypeError('Invalid seller orders response.')
        if (active) setOrders(loaded)
      })
      .catch(() => {
        if (active) {
          setOrders([])
          setError('Satıcı siparişleri yüklenemedi. Lütfen tekrar dene.')
        }
      })
    return () => {
      active = false
    }
  }, [token])

  async function advanceOrder(order: SellerOrder, targetStatus: OrderFulfillmentStatus) {
    setActiveOrderId(order.id)
    setError('')
    setNotice('')
    try {
      const updated = await updateSellerOrderStatus(token, order.id, targetStatus)
      setOrders((current) =>
        (current ?? []).map((item) => item.id === updated.id ? updated : item),
      )
      setNotice(`Sipariş #${order.order_id} paketinin durumu güncellendi.`)
    } catch {
      setError(
        `Sipariş #${order.order_id} güncellenemedi. Durumu yenileyip tekrar dene.`,
      )
    } finally {
      setActiveOrderId(null)
    }
  }

  return (
    <section aria-labelledby="seller-orders-heading" className="seller-panel seller-orders-panel">
      <div className="seller-panel-heading">
        <div>
          <span className="products-kicker">SATICI ALANI</span>
          <h2 id="seller-orders-heading">Siparişlerim</h2>
        </div>
        <button
          className="retry-button"
          onClick={() => {
            setError('')
            void refresh()
          }}
          type="button"
        >
          Yenile
        </button>
      </div>
      <p className="admin-orders-disclaimer">
        Yalnızca mağazana ait ürün kalemleri gösterilir. Gönderim ve teslim durumları bu öğrenme
        uygulamasında manuel kayıttır; gerçek kargo takibi yapılmaz.
      </p>
      {error && <p className="products-error" role="alert">{error}</p>}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {orders === null ? (
        <p className="products-status" role="status">Satıcı siparişleri yükleniyor...</p>
      ) : orders.length === 0 ? (
        !error && <p className="store-empty">Henüz mağazana ait sipariş bulunmuyor.</p>
      ) : (
        <div className="admin-order-list">
          {orders.map((order) => {
            const nextStatus = nextStatuses[order.status]
            return (
              <article className="admin-order-card" key={order.id}>
                <div className="seller-panel-heading">
                  <div>
                    <h3>Sipariş #{order.order_id}</h3>
                    <p>{order.store_name}</p>
                  </div>
                  <span className="application-status">{statusLabels[order.status]}</span>
                </div>
                {order.shipping_address && (
                  <section
                    className="order-delivery-snapshot"
                    aria-label={`Sipariş ${order.order_id} teslimat bilgileri`}
                  >
                    <h4>Teslimat bilgileri</h4>
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
                  </section>
                )}
                <ul className="admin-order-items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.product_name} · {item.quantity} adet
                    </li>
                  ))}
                </ul>
                <ol
                  aria-label={`Sipariş ${order.order_id} paket geçmişi`}
                  className="order-status-history"
                >
                  {order.history.map((event, index) => (
                    <li key={`${event.action}-${event.created_at}-${index}`}>
                      <span>{fulfillmentEventLabel(event.action)}</span>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString('tr-TR')}
                      </time>
                    </li>
                  ))}
                </ol>
                {nextStatus && (
                  <div className="admin-order-actions">
                    <button
                      className="retry-button"
                      disabled={activeOrderId !== null}
                      onClick={() => void advanceOrder(order, nextStatus)}
                      type="button"
                    >
                      {activeOrderId === order.id
                        ? 'Güncelleniyor...'
                        : nextStatusLabels[nextStatus]}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
