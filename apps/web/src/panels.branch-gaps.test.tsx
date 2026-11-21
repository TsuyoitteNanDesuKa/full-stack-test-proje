import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSellerApplicationsPanel from './AdminSellerApplicationsPanel'
import SellerOrdersPanel from './SellerOrdersPanel'
import type { AdminSellerApplication, SellerOrder } from './api'
import {
  getSellerApplications,
  getSellerOrders,
  reviewSellerApplication,
} from './api'

vi.mock('./api', () => ({
  getSellerApplications: vi.fn(),
  getSellerOrders: vi.fn(),
  reviewSellerApplication: vi.fn(),
  updateSellerOrderStatus: vi.fn(),
}))

const baseItem = {
  id: 31,
  product_id: 12,
  product_name: 'Sample product',
  unit_price: '12.50',
  quantity: 2,
  line_total: '25.00',
}

function sellerOrder(overrides: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id: 33,
    order_id: 21,
    store_name: 'Sample Store',
    status: 'paid',
    order_status: 'paid',
    items: [baseItem],
    history: [],
    shipping_address: null,
    delivery_method: 'standard',
    created_at: '2026-11-04T20:00:00Z',
    updated_at: '2026-11-04T20:00:00Z',
    ...overrides,
  } as SellerOrder
}

function adminApplication(overrides: Partial<AdminSellerApplication> = {}): AdminSellerApplication {
  return {
    id: 5,
    owner_subject: 'buyer-subject',
    applicant_type: 'individual',
    legal_name: 'Sample Buyer',
    representative_name: null,
    store_name: 'Sample Store',
    contact_phone: '05551234567',
    city: 'Istanbul',
    district: 'Kadikoy',
    primary_category: 'Care',
    business_description: 'Care products',
    status: 'submitted',
    applicant_note: null,
    admin_note: null,
    created_at: '2026-11-04T20:00:00Z',
    updated_at: '2026-11-04T20:00:00Z',
    ...overrides,
  } as AdminSellerApplication
}

describe('SellerOrdersPanel branch gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a retryable error when the refresh button fails after an initial load', async () => {
    vi.mocked(getSellerOrders)
      .mockResolvedValueOnce([sellerOrder()])
      .mockRejectedValueOnce(new Error('network'))
    const user = userEvent.setup()

    render(<SellerOrdersPanel token="seller-token" />)
    await screen.findByText(/#21/)
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Satıcı siparişleri yüklenemedi. Lütfen tekrar dene.',
    )
  })

  it('clears the error after a successful refresh', async () => {
    vi.mocked(getSellerOrders)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([sellerOrder()])
    const user = userEvent.setup()

    render(<SellerOrdersPanel token="seller-token" />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('labels every fulfillment event type including fallbacks', async () => {
    const events = [
      'created',
      'payment_succeeded',
      'seller_status_changed',
      'admin_status_changed',
      'admin_refund',
      'buyer_cancelled',
      'legacy_import',
      'something_new',
    ]
    vi.mocked(getSellerOrders).mockResolvedValue([
      sellerOrder({
        history: events.map((action, index) => ({
          action,
          from_status: null,
          to_status: 'paid',
          created_at: `2026-11-04T20:0${index}:00Z`,
          actor_subject: null,
        })),
      } as Partial<SellerOrder>),
    ])

    render(<SellerOrdersPanel token="seller-token" />)
    expect(await screen.findByText('Satıcı paketi oluşturuldu')).toBeInTheDocument()
    expect(screen.getByText('Ödeme onaylandı')).toBeInTheDocument()
    expect(screen.getByText('Satıcı paket durumunu güncelledi')).toBeInTheDocument()
    expect(screen.getByText('Yönetici paket durumunu güncelledi')).toBeInTheDocument()
    expect(screen.getAllByText('Paket iptal edildi')).toHaveLength(2)
    expect(screen.getByText('Önceki paket kaydı')).toBeInTheDocument()
    expect(screen.getByText('Paket durumu güncellendi')).toBeInTheDocument()
  })

  it('offers no status action for orders that cannot advance', async () => {
    vi.mocked(getSellerOrders).mockResolvedValue([
      sellerOrder({ status: 'delivered', order_status: 'delivered' } as Partial<SellerOrder>),
    ])

    render(<SellerOrdersPanel token="seller-token" />)

    await screen.findByText(/#21/)
    expect(screen.queryByRole('button', { name: /olarak işaretle|Hazırlanmaya al/ })).not.toBeInTheDocument()
  })
})

describe('AdminSellerApplicationsPanel branch gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows an error when the refresh button fails after a successful load', async () => {
    vi.mocked(getSellerApplications)
      .mockResolvedValueOnce([adminApplication()])
      .mockRejectedValueOnce(new Error('network'))
    const user = userEvent.setup()

    render(<AdminSellerApplicationsPanel token="admin-token" />)
    await screen.findByText('Sample Store')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Satıcı başvuruları yüklenemedi. Lütfen tekrar dene.',
    )
  })

  it('shows the Keycloak-specific message when approval fails', async () => {
    vi.mocked(getSellerApplications).mockResolvedValue([
      adminApplication({ status: 'under_review' }),
    ])
    vi.mocked(reviewSellerApplication).mockRejectedValueOnce(new Error('keycloak down'))
    const user = userEvent.setup()

    render(<AdminSellerApplicationsPanel token="admin-token" />)
    await user.click(await screen.findByRole('button', { name: 'Onayla' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Başvuru onaylanamadı. Rol atama işlemini ve Keycloak bağlantısını kontrol et.',
    )
  })

  it('sends applicant and admin notes when changes are requested', async () => {
    vi.mocked(getSellerApplications).mockResolvedValue([
      adminApplication({ status: 'under_review' }),
    ])
    vi.mocked(reviewSellerApplication).mockResolvedValueOnce(
      adminApplication({ status: 'changes_requested' }),
    )
    const user = userEvent.setup()

    render(<AdminSellerApplicationsPanel token="admin-token" />)
    await user.type(await screen.findByLabelText('Başvuru sahibine not'), 'Adres belgesi ekle')
    await user.type(screen.getByLabelText('Yönetici notu'), 'Ek belge gerekli')
    await user.click(screen.getByRole('button', { name: 'Düzenleme iste' }))

    await waitFor(() =>
      expect(reviewSellerApplication).toHaveBeenCalledWith(
        'admin-token',
        5,
        expect.objectContaining({
          action: 'request_changes',
          applicant_note: 'Adres belgesi ekle',
          admin_note: 'Ek belge gerekli',
        }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Başvuru kararı kaydedildi.')
  })

  it('shows the empty state when there are no applications', async () => {
    vi.mocked(getSellerApplications).mockResolvedValue([])

    render(<AdminSellerApplicationsPanel token="admin-token" />)

    expect(await screen.findByText('Henüz satıcı başvurusu bulunmuyor.')).toBeInTheDocument()
  })
})
