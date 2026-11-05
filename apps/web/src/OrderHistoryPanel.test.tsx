import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderHistoryPanel from './OrderHistoryPanel'
import { createPayment, getMyOrders } from './api'
import type { CustomerOrder, CustomerPayment } from './api'

vi.mock('./api', () => ({
  createPayment: vi.fn(),
  getMyOrders: vi.fn(),
}))

const sampleOrder: CustomerOrder = {
  id: 21,
  status: 'pending_payment',
  total_amount: '25.00',
  created_at: '2026-11-04T20:00:00Z',
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
  amount: '25.00',
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
    expect(screen.getByText('Liva krem · 2 adet · ₺25,00')).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledWith('buyer-token')
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
})
