import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderHistoryPanel from './OrderHistoryPanel'
import { ApiError, createPayment, createProductReturn, getMyOrders } from './api'
import type { CustomerOrder, CustomerPayment, ProductReturn } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  createPayment: vi.fn(),
  createProductReturn: vi.fn(),
  getMyOrders: vi.fn(),
}))

const sampleOrder: CustomerOrder = {
  id: 21,
  status: 'pending_payment',
  item_subtotal: '25.00',
  total_amount: '74.90',
  shipping_address: {
    label: 'Ev',
    recipient_name: 'Ada Buyer',
    phone: '+905551234567',
    city: 'Istanbul',
    district: 'Kadikoy',
    address_line: 'Example Street 1',
    postal_code: null,
  },
  delivery_method: 'standard',
  delivery_fee: '49.90',
  created_at: '2026-11-04T20:00:00Z',
  fulfillments: [],
  history: [
    {
      action: 'created',
      from_status: null,
      to_status: 'pending_payment',
      reason: null,
      created_at: '2026-11-04T20:00:00Z',
    },
  ],
  items: [
    {
      id: 31,
      product_id: 42,
      product_name: 'Liva krem',
      unit_price: '12.50',
      quantity: 2,
      line_total: '25.00',
    },
  ],
}

const samplePayment: CustomerPayment = {
  id: 8,
  order_id: sampleOrder.id,
  provider_reference: 'mock-reference',
  status: 'pending',
  amount: '74.90',
  currency: 'TRY',
  expires_at: '2026-11-04T20:02:00Z',
  checkout_url: '/api/v1/payments/mock-checkout/8/token',
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
}

describe('OrderHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMyOrders).mockResolvedValue([])
    vi.mocked(createPayment).mockResolvedValue(samplePayment)
    vi.mocked(createProductReturn).mockReset()
  })

  it('loads and displays order snapshots when opened', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([sampleOrder])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
    expect(screen.getByText('Ödeme bekleniyor')).toBeInTheDocument()
    expect(screen.getByText('Sipariş oluşturuldu')).toBeInTheDocument()
    expect(screen.getByText('Liva krem · 2 adet · ₺25,00')).toBeInTheDocument()
    expect(screen.getByText('Teslimat adresi')).toBeInTheDocument()
    expect(screen.getByText('Ada Buyer · +905551234567')).toBeInTheDocument()
    expect(screen.getByText(/Ürün ara toplamı:/)).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledWith('buyer-token')
  })

  it('shows each seller package and its own items separately from the order summary', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([{
      ...sampleOrder,
      status: 'paid',
      fulfillments: [{
        id: 1,
        store_name: 'İlk mağaza',
        status: 'shipped',
        items: sampleOrder.items,
        history: [],
      }, {
        id: 2,
        store_name: 'İkinci mağaza',
        status: 'processing',
        items: [{ ...sampleOrder.items[0], id: 32, product_name: 'Sabun' }],
        history: [],
      }],
    }])
    render(<OrderHistoryPanel latestOrder={null} refreshVersion={0} token="buyer-token" />)
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    const packages = await screen.findByRole('region', { name: 'Sipariş 21 satıcı paketleri' })
    const [first, second] = within(packages).getAllByRole('article')
    expect(first).toHaveTextContent('İlk mağaza')
    expect(first).toHaveTextContent('Kargoya verildi')
    expect(first).toHaveTextContent('Liva krem · 2 adet')
    expect(first).not.toHaveTextContent('Sabun')
    expect(second).toHaveTextContent('İkinci mağaza')
    expect(second).toHaveTextContent('Hazırlanıyor')
    expect(second).toHaveTextContent('Sabun · 2 adet')
    expect(second).not.toHaveTextContent('Liva krem')
  })

  it('shows an empty state and latest order confirmation', async () => {
    render(
      <OrderHistoryPanel
        latestOrder={sampleOrder}
        refreshVersion={0}
        token="buyer-token"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Siparişin oluşturuldu: #21. Ödeme adımı bekleniyor.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByText('Henüz siparişin yok.')).toBeInTheDocument()
  })

  it('refreshes current order statuses on demand', async () => {
    vi.mocked(getMyOrders)
      .mockResolvedValueOnce([sampleOrder])
      .mockResolvedValueOnce([{ ...sampleOrder, status: 'processing' }])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByText('Ödeme bekleniyor')
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByText('Hazırlanıyor')).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledTimes(2)
  })

  it('starts payment and exposes the hosted checkout link', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([sampleOrder])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByRole('heading', { name: 'Sipariş #21' })
    fireEvent.click(screen.getByRole('button', { name: 'Ödemeye devam et' }))

    expect(await screen.findByRole('link', {
      name: 'Güvenli test ödeme sayfasına git',
    })).toHaveAttribute('href', samplePayment.checkout_url)
    expect(createPayment).toHaveBeenCalledWith(
      'buyer-token',
      sampleOrder.id,
      `order-${sampleOrder.id}-payment`,
    )
  })

  it('reports a payment-start failure without hiding order history', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([sampleOrder])
    vi.mocked(createPayment).mockRejectedValueOnce(new Error('Payment provider unavailable'))
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByRole('heading', { name: 'Sipariş #21' })
    fireEvent.click(screen.getByRole('button', { name: 'Ödemeye devam et' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ödeme başlatılamadı.')
    expect(screen.getByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
  })

  it('submits partial and remaining item returns and updates the visible history', async () => {
    const deliveredOrder: CustomerOrder = {
      ...sampleOrder,
      status: 'delivered',
      history: [
        ...sampleOrder.history,
        {
          action: 'admin_status_changed',
          from_status: 'shipped',
          to_status: 'delivered',
          reason: null,
          created_at: new Date().toISOString(),
        },
      ],
    }
    const firstReturn: ProductReturn = {
      id: 51,
      order_item_id: 31,
      product_name: 'Liva krem',
      quantity: 1,
      reason: 'Ambalajı hasarlı geldi',
      status: 'approved',
      refund_amount: '12.50',
      created_at: new Date().toISOString(),
    }
    const secondReturn: ProductReturn = {
      ...firstReturn,
      id: 52,
      reason: 'Kalan ürünü de iade ediyorum',
    }
    vi.mocked(getMyOrders).mockResolvedValue([deliveredOrder])
    vi.mocked(createProductReturn)
      .mockResolvedValueOnce(firstReturn)
      .mockResolvedValueOnce(secondReturn)
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByRole('heading', { name: 'Sipariş #21' })

    fireEvent.click(screen.getByRole('button', { name: 'İade et Liva krem' }))
    fireEvent.change(screen.getByLabelText('İade nedeni'), {
      target: { value: firstReturn.reason },
    })
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))

    expect(await screen.findByText(/İade talebin otomatik onaylandı/)).toBeInTheDocument()
    expect(screen.getByText(/Liva krem · 1 adet · ₺12,50 · Otomatik onaylandı/))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İade et Liva krem' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'İade et Liva krem' }))
    fireEvent.change(screen.getByLabelText('İade nedeni'), {
      target: { value: secondReturn.reason },
    })
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))

    await waitFor(() => expect(createProductReturn).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Kalan ürünü de iade ediyorum')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'İade et Liva krem' })).not.toBeInTheDocument()
    expect(createProductReturn).toHaveBeenCalledTimes(2)
    expect(createProductReturn).toHaveBeenNthCalledWith(
      1,
      'buyer-token',
      deliveredOrder.id,
      {
        order_item_id: 31,
        quantity: 1,
        reason: firstReturn.reason,
      },
      expect.any(String),
    )
  })

  it('allows retrying a failed order-history request', async () => {
    vi.mocked(getMyOrders)
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce([sampleOrder])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sipariş geçmişi yüklenemedi.')
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(await screen.findByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledTimes(2)
  })

  it('validates a return and reuses the idempotency key after a network failure', async () => {
    const deliveredOrder: CustomerOrder = {
      ...sampleOrder,
      status: 'delivered',
      history: [{
        action: 'admin_status_changed',
        from_status: 'shipped',
        to_status: 'delivered',
        reason: null,
        created_at: new Date().toISOString(),
      }],
    }
    vi.mocked(getMyOrders).mockResolvedValue([deliveredOrder])
    vi.mocked(createProductReturn)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        id: 51,
        order_item_id: 31,
        product_name: 'Liva krem',
        quantity: 1,
        reason: 'Hasarlı ürün',
        status: 'approved',
        refund_amount: '12.50',
        created_at: new Date().toISOString(),
      })
    render(<OrderHistoryPanel latestOrder={null} refreshVersion={0} token="buyer-token" />)
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    fireEvent.click(await screen.findByRole('button', { name: 'İade et Liva krem' }))
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))
    expect(screen.getByRole('alert')).toHaveTextContent('İade miktarı ve en az 5 karakterlik nedeni kontrol et.')
    expect(createProductReturn).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('İade nedeni'), { target: { value: 'Hasarlı ürün' } })
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('İade talebi gönderilemedi.')
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))
    expect(await screen.findByText(/İade talebin otomatik onaylandı/)).toBeInTheDocument()
    expect(createProductReturn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createProductReturn).mock.calls[0][3]).toBe(
      vi.mocked(createProductReturn).mock.calls[1][3],
    )
  })

  it('validates the return quantity, shows an API rejection, and permits cancellation', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([{
      ...sampleOrder,
      status: 'delivered',
      history: [{
        action: 'admin_status_changed',
        from_status: 'shipped',
        to_status: 'delivered',
        reason: null,
        created_at: new Date().toISOString(),
      }],
    }])
    vi.mocked(createProductReturn).mockRejectedValueOnce(new ApiError('İade süresi doldu.', 409))
    render(<OrderHistoryPanel latestOrder={null} refreshVersion={0} token="buyer-token" />)
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    fireEvent.click(await screen.findByRole('button', { name: 'İade et Liva krem' }))
    fireEvent.change(screen.getByLabelText('İade miktarı (en fazla 2)'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('İade nedeni'), { target: { value: 'Hasarlı ürün' } })
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))
    expect(screen.getByRole('alert')).toHaveTextContent('İade miktarı')
    expect(createProductReturn).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('İade miktarı (en fazla 2)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'İade talebini gönder' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('İade süresi doldu.')
    fireEvent.click(screen.getByRole('button', { name: 'İptal' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İade et Liva krem' })).toBeInTheDocument()
  })
})
