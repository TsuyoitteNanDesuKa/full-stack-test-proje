import { useCallback, useEffect, useState } from 'react'
import {
  getAdminOrders,
  refundAdminOrder,
  updateAdminOrderStatus,
} from './api'
import type {
  AdminOrder,
  OrderFulfillmentStatus,
  OrderStatus,
} from './api'

const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: 'Ödeme bekleniyor',
  paid: 'Ödendi',
  processing: 'Hazırlanıyor',
  shipped: 'Kargoya verildi',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
}

const eventLabels: Record<string, string> = {
  created: 'Sipariş oluşturuldu',
  payment_succeeded: 'Ödeme alındı',
  payment_failed: 'Ödeme başarısız oldu',
  payment_cancelled: 'Ödeme iptal edildi',
  payment_expired: 'Ödeme süresi doldu',
  admin_status_changed: 'Sipariş durumu güncellendi',
  admin_refund: 'Yerel iade kaydı oluşturuldu',
  legacy_import: 'Önceki sipariş kaydı',
  seller_status_changed: 'Satıcı paket durumunu güncelledi',
  fulfillment_status_changed: 'Paket durumu güncellendi',
}

const nextStatuses: Partial<Record<OrderStatus, OrderFulfillmentStatus>> = {
  paid: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
}

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(Number(value))
}

export default function AdminOrdersPanel({ token }: { token: string }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null)
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    try {
      const loaded = await getAdminOrders(token)
      if (!Array.isArray(loaded)) throw new TypeError('Invalid admin orders response.')
      setOrders(loaded)
    } catch {
      setOrders([])
      setError('Siparişler yüklenemedi. Lütfen tekrar dene.')
    }
  }, [token])

  useEffect(() => {
    let active = true
    getAdminOrders(token)
      .then((loaded) => {
        if (!Array.isArray(loaded)) throw new TypeError('Invalid admin orders response.')
        if (active) setOrders(loaded)
      })
      .catch(() => {
        if (active) {
          setOrders([])
          setError('Siparişler yüklenemedi. Lütfen tekrar dene.')
        }
      })
    return () => {
      active = false
    }
  }, [token])

  async function updateStatus(order: AdminOrder, status: OrderFulfillmentStatus) {
    setActiveOrderId(order.id)
    setError('')
    setNotice('')
    try {
      const updated = await updateAdminOrderStatus(token, order.id, status)
      setOrders((current) =>
        (current ?? []).map((item) => item.id === updated.id ? updated : item),
      )
      setNotice(`Sipariş #${order.id} durumu güncellendi.`)
    } catch {
      setError(`Sipariş #${order.id} güncellenemedi. Durumu yenileyip tekrar dene.`)
    } finally {
      setActiveOrderId(null)
    }
  }

  async function refundOrder(order: AdminOrder) {
    const reason = reasons[order.id]?.trim() ?? ''
    if (reason.length < 5) return

    setActiveOrderId(order.id)
    setError('')
    setNotice('')
    try {
      const updated = await refundAdminOrder(token, order.id, reason)
      setOrders((current) =>
        (current ?? []).map((item) => item.id === updated.id ? updated : item),
      )
      setReasons((current) => ({ ...current, [order.id]: '' }))
      setNotice(`Sipariş #${order.id} iptal edildi ve yerel iade kaydı oluşturuldu.`)
    } catch {
      setError(`Sipariş #${order.id} için iade kaydı oluşturulamadı.`)
    } finally {
      setActiveOrderId(null)
    }
  }

  return (
    <section aria-labelledby="admin-orders-heading" className="seller-panel admin-orders-panel">
      <div className="seller-panel-heading">
        <div>
          <span className="products-kicker">YÖNETİM</span>
          <h2 id="admin-orders-heading">Sipariş yönetimi</h2>
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
        Durum güncellemeleri ve iade kayıtları manueldir. Mock ödeme iadesi gerçek para transferi
        yapmaz.
      </p>
      {error && <p className="products-error" role="alert">{error}</p>}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {orders === null ? (
        <p className="products-status" role="status">Siparişler yükleniyor...</p>
      ) : orders.length === 0 ? (
        !error && <p className="store-empty">Henüz sipariş bulunmuyor.</p>
      ) : (
        <div className="admin-order-list">
          {orders.map((order) => {
            const nextStatus = nextStatuses[order.status]
            const canRefund =
              (order.status === 'paid' || order.status === 'processing') &&
              order.payment_status === 'succeeded'

            return (
              <article className="admin-order-card" key={order.id}>
                <div className="seller-panel-heading">
                  <div>
                    <h3>Sipariş #{order.id}</h3>
                    <p>Alıcı: {order.owner_subject}</p>
                  </div>
                  <span className="application-status">{orderStatusLabels[order.status]}</span>
                </div>
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
                  </section>
                )}
                {order.delivery_method && (
                  <p>
                    Ürün ara toplamı: <strong>{formatCurrency(order.item_subtotal)}</strong>
                    {' · '}
                    {order.delivery_method === 'express' ? 'Hızlı' : 'Standart'} teslimat:{' '}
                    <strong>{formatCurrency(order.delivery_fee)}</strong>
                  </p>
                )}
                <p>Toplam: <strong>{formatCurrency(order.total_amount)}</strong></p>
                <ul className="admin-order-items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.product_name} · {item.quantity} adet · {formatCurrency(item.line_total)}
                    </li>
                  ))}
                </ul>
                {order.fulfillments.length > 0 && (
                  <section
                    aria-label={`Sipariş ${order.id} satıcı paketleri`}
                    className="admin-fulfillment-list"
                  >
                    <h4>Satıcı paketleri</h4>
                    {order.fulfillments.map((fulfillment) => (
                      <article key={fulfillment.id}>
                        <div className="order-history-summary">
                          <strong>{fulfillment.store_name}</strong>
                          <span>{orderStatusLabels[fulfillment.status]}</span>
                        </div>
                        <ul>
                          {fulfillment.items.map((item) => (
                            <li key={item.id}>
                              {item.product_name} · {item.quantity} adet
                            </li>
                          ))}
                        </ul>
                        <ol
                          aria-label={`${fulfillment.store_name} paket geçmişi`}
                          className="order-status-history"
                        >
                          {fulfillment.history.map((event, index) => (
                            <li key={`${event.action}-${event.created_at}-${index}`}>
                              <span>{eventLabels[event.action] ?? 'Paket durumu güncellendi'}</span>
                              <time dateTime={event.created_at}>
                                {new Date(event.created_at).toLocaleString('tr-TR')}
                              </time>
                              <p>İşlemi yapan: {event.actor_subject ?? 'Sistem'}</p>
                            </li>
                          ))}
                        </ol>
                      </article>
                    ))}
                  </section>
                )}
                <ol aria-label={`Sipariş ${order.id} işlem geçmişi`} className="order-status-history">
                  {order.history.map((event, index) => (
                    <li key={`${event.action}-${event.created_at}-${index}`}>
                      <span>{eventLabels[event.action] ?? 'Sipariş güncellendi'}</span>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString('tr-TR')}
                      </time>
                      {event.reason && <p>{event.reason}</p>}
                    </li>
                  ))}
                </ol>
                <div className="admin-order-actions">
                  {nextStatus && (
                    <button
                      className="retry-button"
                      disabled={activeOrderId !== null}
                      onClick={() => void updateStatus(order, nextStatus)}
                      type="button"
                    >
                      {activeOrderId === order.id
                        ? 'Güncelleniyor...'
                        : `${orderStatusLabels[nextStatus]} aşamasına geçir`}
                    </button>
                  )}
                  {canRefund && (
                    <div className="admin-refund-form">
                      <label htmlFor={`refund-reason-${order.id}`}>İptal/iade nedeni</label>
                      <textarea
                        id={`refund-reason-${order.id}`}
                        maxLength={500}
                        minLength={5}
                        onChange={(event) => {
                          const reason = event.target.value
                          setReasons((current) => ({ ...current, [order.id]: reason }))
                        }}
                        value={reasons[order.id] ?? ''}
                      />
                      <button
                        className="delete-product-button"
                        disabled={
                          activeOrderId !== null ||
                          (reasons[order.id]?.trim().length ?? 0) < 5
                        }
                        onClick={() => void refundOrder(order)}
                        type="button"
                      >
                        İptal et ve yerel iade kaydı oluştur
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
