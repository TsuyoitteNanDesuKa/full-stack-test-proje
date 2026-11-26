import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CustomerOrder, CustomerPayment, OrderItem } from './api'
import { ApiError, cancelMyOrder, createPayment, createProductReturn, getMyOrdersPage } from './api'
import type {
  CancelledOrderCartItemResult,
  CancelledOrderCartResult,
} from './cancelledOrderCart'

const ORDER_PAGE_SIZE = 20

interface OrderHistoryPanelProps {
  token: string
  refreshVersion: number
  latestOrder: CustomerOrder | null
  isCartMutating?: boolean
  onRefreshCart?: (token: string) => Promise<boolean>
  onRestoreCancelledOrder?: (
    token: string,
    items: OrderItem[],
  ) => Promise<CancelledOrderCartResult | null>
}

interface CancelledOrderRestoreReport {
  items: Record<number, CancelledOrderCartItemResult>
  uncertainItemId: number | null
  needsInspection: boolean
  message: string
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
    case 'fulfillment_status_changed':
      return 'Sipariş durumu güncellendi'
    case 'admin_refund':
      return 'Sipariş iptal edildi ve iade kaydı oluşturuldu'
    case 'buyer_cancelled':
      return 'Sipariş talebinle iptal edildi'
    case 'legacy_import':
      return 'Sipariş durumu kaydı içe aktarıldı'
    default:
      return 'Sipariş güncellendi'
  }
}

function canReturnOrder(order: CustomerOrder): boolean {
  if (order.status !== 'shipped' && order.status !== 'delivered') return false
  const transition = [...order.history].reverse().find(
    (event) =>
      (event.action === 'admin_status_changed' || event.action === 'fulfillment_status_changed') &&
      event.to_status === order.status,
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
  isCartMutating = false,
  onRefreshCart = async () => false,
  onRestoreCancelledOrder = async () => null,
}: OrderHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [cancelledOrderIds, setCancelledOrderIds] = useState<Set<number>>(() => new Set())
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [pageContext, setPageContext] = useState({ token, refreshVersion })
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
  const [cancelFormOrderId, setCancelFormOrderId] = useState<number | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [cancelNotice, setCancelNotice] = useState<{ orderId: number; text: string } | null>(null)
  const [restoreState, setRestoreState] = useState<{
    token: string
    byOrder: Record<number, CancelledOrderRestoreReport>
  }>({ token, byOrder: {} })
  const [restoringOrderId, setRestoringOrderId] = useState<number | null>(null)
  const [refreshingRestoreOrderId, setRefreshingRestoreOrderId] = useState<number | null>(null)
  const restoreToken = useRef(token)
  const restoreReports = restoreState.token === token ? restoreState.byOrder : {}

  useLayoutEffect(() => {
    if (restoreToken.current !== token) {
      setRestoringOrderId(null)
      setRefreshingRestoreOrderId(null)
    }
    restoreToken.current = token
  }, [token])

  if (pageContext.token !== token || pageContext.refreshVersion !== refreshVersion) {
    if (pageContext.token !== token) {
      setOrders([])
      setCancelledOrderIds(new Set())
      setPaymentsByOrder({})
      setPaymentErrors({})
      setCancelFormOrderId(null)
      setCancellingOrderId(null)
      setCancelError('')
      setCancelNotice(null)
      setReturningItem(null)
      setReturningOrderId(null)
      setReturnError('')
      setReturnNotice('')
      setReturnNoticeOrderId(null)
      setRestoreState({ token, byOrder: {} })
      setRestoringOrderId(null)
      setRefreshingRestoreOrderId(null)
    }
    setPageContext({ token, refreshVersion })
    setOffset(0)
    if (isOpen) setIsLoading(true)
    setError('')
  }

  async function submitCancellation(order: CustomerOrder) {
    setCancellingOrderId(order.id)
    setCancelError('')
    try {
      const updated = await cancelMyOrder(token, order.id, { reason: cancellationReason.trim() || null })
      setOrders((current) => current.map((item) => item.id === order.id ? updated : item))
      setCancelledOrderIds((current) => new Set(current).add(order.id))
      setCancelFormOrderId(null)
      const cancellation = updated.history.findLast((event) => event.action === 'buyer_cancelled')
      setCancelNotice({
        orderId: order.id,
        text: cancellation?.from_status === 'pending_payment'
          ? 'Siparişin iptal edildi.'
          : 'Siparişin iptal edildi ve yerel iade kaydı oluşturuldu. Gerçek para transferi yapılmadı.',
      })
    } catch (requestError) {
      setCancelError(requestError instanceof ApiError
        ? requestError.message
        : 'Sipariş iptal edilemedi. Bağlantıyı kontrol edip tekrar dene.')
    } finally {
      setCancellingOrderId(null)
    }
  }

  async function restoreCancelledOrder(order: CustomerOrder) {
    const previous = restoreReports[order.id]
    if (restoringOrderId !== null || isCartMutating || previous?.needsInspection) return
    const remainingItems = order.items.filter((item) => {
      const previousResult = previous?.items[item.id]
      return previousResult?.status !== 'added' && previousResult?.status !== 'unknown'
    })
    if (remainingItems.length === 0) return

    setRestoringOrderId(order.id)
    try {
      const result = await onRestoreCancelledOrder(token, remainingItems)
      if (!result || restoreToken.current !== token || result.cancelled) return
      setRestoreState((current) => {
        const byOrder = current.token === token ? current.byOrder : {}
        const previousReport = byOrder[order.id]
        const itemResults = { ...previousReport?.items }
        result.items.forEach((itemResult) => {
          itemResults[itemResult.item.id] = itemResult
        })
        const uncertainItem = result.items.find((item) => item.status === 'unknown')
        return {
          token,
          byOrder: {
            ...byOrder,
            [order.id]: {
              items: itemResults,
              uncertainItemId: uncertainItem?.item.id ??
                previousReport?.uncertainItemId ?? null,
              needsInspection: result.uncertain,
              message: '',
            },
          },
        }
      })
    } catch {
      if (restoreToken.current === token) {
        setRestoreState((current) => {
          const byOrder = current.token === token ? current.byOrder : {}
          return {
            token,
            byOrder: {
              ...byOrder,
              [order.id]: {
                ...byOrder[order.id],
                items: byOrder[order.id]?.items ?? {},
                uncertainItemId: byOrder[order.id]?.uncertainItemId ?? null,
                needsInspection: false,
                message: 'Sepete ekleme tamamlanamadı. Mevcut sepeti kontrol et.',
              },
            },
          }
        })
      }
    } finally {
      if (restoreToken.current === token) setRestoringOrderId(null)
    }
  }

  async function refreshAfterUncertainRestore(orderId: number) {
    setRefreshingRestoreOrderId(orderId)
    let refreshed = false
    try {
      refreshed = await onRefreshCart(token)
    } catch {
      refreshed = false
    }
    if (restoreToken.current === token && refreshed) {
      setRestoreState((current) => {
        if (current.token !== token) return current
        const report = current.byOrder[orderId]
        if (!report) return current
        return {
          ...current,
          byOrder: {
            ...current.byOrder,
            [orderId]: { ...report, needsInspection: false },
          },
        }
      })
    } else if (restoreToken.current === token) {
      setRestoreState((current) => {
        if (current.token !== token) return current
        const report = current.byOrder[orderId]
        if (!report) return current
        return {
          ...current,
          byOrder: {
            ...current.byOrder,
            [orderId]: {
              ...report,
              message: 'Sepet yenilenemedi; sonucu belirsiz kalem için tekrar deneme.',
            },
          },
        }
      })
    }
    if (restoreToken.current === token) setRefreshingRestoreOrderId(null)
  }

  function restoreItemStatus(itemResult: CancelledOrderCartItemResult): string {
    switch (itemResult.status) {
      case 'added':
        return `Sepete eklendi (${itemResult.item.quantity} adet, güncel fiyat ve stokla).`
      case 'deleted':
        return 'Ürün artık mevcut değil; eklenmedi.'
      case 'insufficient_stock':
        return 'Mevcut sepet miktarıyla birleştirildiğinde stok yetersiz; eklenmedi.'
      case 'failed':
        return `İstek reddedildi; işlem durduruldu.${itemResult.message ? ` ${itemResult.message}` : ''}`
      case 'unknown':
        return 'Sonuç bilinmiyor; ürün eklenmiş olabilir.'
      case 'not_attempted':
        return 'Önceki kalem nedeniyle gönderilmedi.'
    }
  }

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
    getMyOrdersPage(token, ORDER_PAGE_SIZE, offset)
      .then((response) => {
        if (active) {
          setOrders(response.items)
          setHasMore(response.has_more)
          const cancelledIds = response.items.filter((order) => order.status === 'cancelled')
          if (cancelledIds.length > 0) {
            setCancelledOrderIds((current) => {
              const next = new Set(current)
              cancelledIds.forEach((order) => next.add(order.id))
              return next
            })
          }
        }
      })
      .catch(() => {
        if (active) {
          setOrders([])
          setHasMore(false)
          setError('Sipariş geçmişi yüklenemedi. Lütfen tekrar dene.')
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, offset, refreshVersion, retryCount, token])

  return (
    <section className="order-history-section">
      {latestOrder && !cancelledOrderIds.has(latestOrder.id) && (
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
                setOffset(0)
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
            !error && <p className="products-status">
              {offset === 0 ? 'Henüz siparişin yok.' : 'Bu sayfada sipariş yok.'}
            </p>
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
                  {order.status === 'cancelled' && order.items.length > 0 && (() => {
                    const report = restoreReports[order.id]
                    const pendingItems = order.items.filter((item) => {
                      const previousResult = report?.items[item.id]
                      return previousResult?.status !== 'added' &&
                        previousResult?.status !== 'unknown'
                    })
                    const uncertainItem = report?.uncertainItemId === null ||
                      report?.uncertainItemId === undefined
                      ? null
                      : order.items.find((item) => item.id === report.uncertainItemId) ?? null
                    return (
                      <div className="order-return-action">
                        <p>
                          Ürünler mevcut sepetine, siparişteki miktarlarla eklenir. Güncel fiyat ve
                          stok uygulanır; sipariş veya ödeme başlatılmaz.
                        </p>
                        <p role="note">
                          Dikkat: Ekleme geçmişi yalnızca bu sayfa açıkken tutulur. Sayfayı
                          yenilersen veya işlemi yeniden başlatırsan aynı miktarlar sepete tekrar
                          eklenebilir. Tekrar denemeden önce sepetini kontrol et.
                        </p>
                        {report && Object.keys(report.items).length > 0 && (
                          <ul aria-label={`Sipariş ${order.id} sepete ekleme sonuçları`} role="status">
                            {Object.values(report.items).map((itemResult) => (
                              <li key={itemResult.item.id}>
                                {itemResult.item.product_name}: {restoreItemStatus(itemResult)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {report?.message && <p role="alert">{report.message}</p>}
                        {uncertainItem && (
                          <div role="alert">
                            <p>
                              {uncertainItem.product_name} için isteğin sonucu bilinmiyor; ürün
                              sepete eklenmiş olabilir. Sepeti yenileyip kontrol etmeden tekrar
                              deneme. Bu kalem otomatik yeniden gönderilmeyecek; yenilenen sepette
                              görünmüyorsa ürün sayfasından ekle.
                            </p>
                            {report.needsInspection ? (
                              <button
                                className="retry-button"
                                disabled={refreshingRestoreOrderId === order.id || isCartMutating}
                                onClick={() => void refreshAfterUncertainRestore(order.id)}
                                type="button"
                              >
                                {refreshingRestoreOrderId === order.id
                                  ? 'Sepet yenileniyor...'
                                  : 'Sepeti yenile ve kontrol et'}
                              </button>
                            ) : (
                              <p>Sepet yenilendi; belirsiz ürün yeniden gönderilmeyecek.</p>
                            )}
                          </div>
                        )}
                        {report && pendingItems.length > 0 && (
                          <p>
                            Önceki başarılı kalemler yeniden gönderilmez. Belirsiz kalem de
                            otomatik olarak tekrar denenmez.
                          </p>
                        )}
                        <button
                          className="retry-button"
                          disabled={
                            pendingItems.length === 0 ||
                            isCartMutating ||
                            restoringOrderId !== null ||
                            Boolean(report?.needsInspection)
                          }
                          onClick={() => void restoreCancelledOrder(order)}
                          type="button"
                        >
                          {restoringOrderId === order.id
                            ? 'Sepete ekleniyor...'
                            : report
                              ? pendingItems.length === 0
                                ? 'Eklenebilecek kalem kalmadı'
                                : 'Eklenmeyen kalemleri tekrar dene'
                              : 'İptal edilenleri sepete ekle'}
                        </button>
                      </div>
                    )
                  })()}
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
                  {['pending_payment', 'paid', 'processing'].includes(order.status) &&
                    !order.fulfillments.some((item) => item.status === 'shipped' || item.status === 'delivered') && (
                      <div className="order-return-action">
                        {cancelFormOrderId === order.id ? (
                          <div className="order-return-form">
                            <label>
                              İptal nedeni (isteğe bağlı)
                              <textarea maxLength={500} value={cancellationReason}
                                onChange={(event) => setCancellationReason(event.target.value)} />
                            </label>
                            <p>Ödenmiş siparişlerde yalnızca yerel iade kaydı oluşturulur; gerçek para transferi yapılmaz.</p>
                            {cancelError && <p role="alert">{cancelError}</p>}
                            <button className="checkout-button" type="button"
                              disabled={cancellingOrderId !== null}
                              onClick={() => void submitCancellation(order)}>
                              {cancellingOrderId === order.id ? 'İptal ediliyor...' : 'Sipariş iptalini onayla'}
                            </button>
                            <button className="retry-button" type="button" disabled={cancellingOrderId !== null}
                              onClick={() => { setCancelFormOrderId(null); setCancelError('') }}>
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                          <button className="retry-button" type="button" onClick={() => {
                            setCancelFormOrderId(order.id)
                            setCancellationReason('')
                            setCancelError('')
                          }}>
                            Siparişi iptal et
                          </button>
                        )}
                      </div>
                    )}
                  {cancelNotice?.orderId === order.id && <p role="status">{cancelNotice.text}</p>}
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
          {(offset > 0 || hasMore) && (
            <nav aria-label="Sipariş geçmişi sayfaları">
              <button
                className="retry-button"
                disabled={isLoading || offset === 0}
                onClick={() => {
                  setIsLoading(true)
                  setError('')
                  setOffset((current) => Math.max(0, current - ORDER_PAGE_SIZE))
                }}
                type="button"
              >
                Önceki sayfa
              </button>
              <span> Sayfa {Math.floor(offset / ORDER_PAGE_SIZE) + 1} </span>
              <button
                className="retry-button"
                disabled={isLoading || !hasMore}
                onClick={() => {
                  setIsLoading(true)
                  setError('')
                  setOffset((current) => current + ORDER_PAGE_SIZE)
                }}
                type="button"
              >
                Sonraki sayfa
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  )
}
