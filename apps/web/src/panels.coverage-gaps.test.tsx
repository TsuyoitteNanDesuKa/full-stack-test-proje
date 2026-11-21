import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOrdersPanel from './AdminOrdersPanel'
import SellerApplicationPanel from './SellerApplicationPanel'
import type { AdminOrder, SellerApplication } from './api'
import {
  getAdminOrders,
  getMySellerApplication,
  refundAdminOrder,
  updateAdminOrderStatus,
} from './api'

vi.mock('./api', () => ({
  createSellerApplication: vi.fn(),
  getAdminOrders: vi.fn(),
  getMySellerApplication: vi.fn(),
  refundAdminOrder: vi.fn(),
  submitMySellerApplication: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
  updateMySellerApplication: vi.fn(),
  withdrawMySellerApplication: vi.fn(),
}))

const baseItem = {
  id: 31,
  product_id: 12,
  product_name: 'Sample product',
  unit_price: '12.50',
  quantity: 2,
  line_total: '25.00',
}

function adminOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 21,
    owner_subject: 'buyer-subject',
    status: 'paid',
    payment_status: 'succeeded',
    item_subtotal: '25.00',
    total_amount: '25.00',
    shipping_address: null,
    delivery_method: null,
    delivery_fee: '0.00',
    created_at: '2026-11-04T20:00:00Z',
    items: [baseItem],
    fulfillments: [],
    history: [],
    ...overrides,
  } as AdminOrder
}

function application(overrides: Partial<SellerApplication> = {}): SellerApplication {
  return {
    id: 1,
    applicant_type: 'individual',
    legal_name: 'Sample Buyer',
    representative_name: null,
    store_name: 'Sample Store',
    contact_phone: '05551234567',
    city: 'Istanbul',
    district: 'Kadikoy',
    primary_category: 'Care',
    business_description: 'Care products',
    status: 'draft',
    applicant_note: null,
    created_at: '2026-11-04T20:00:00Z',
    updated_at: '2026-11-04T20:00:00Z',
    ...overrides,
  } as SellerApplication
}

describe('AdminOrdersPanel coverage gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('labels express delivery and renders seller fulfillment history with system actor', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([
      adminOrder({
        delivery_method: 'express',
        delivery_fee: '89.90',
        fulfillments: [
          {
            id: 40,
            store_name: 'Fast Store',
            status: 'shipped',
            items: [baseItem],
            history: [
              {
                action: 'seller_status_changed',
                from_status: 'paid',
                to_status: 'shipped',
                created_at: '2026-11-04T20:02:00Z',
                actor_subject: null,
              },
              {
                action: 'unknown_custom_action',
                from_status: null,
                to_status: 'paid',
                created_at: '2026-11-04T20:03:00Z',
                actor_subject: 'ops-user',
              },
            ],
          },
        ],
      }),
    ] as AdminOrder[])

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText(/Hızlı teslimat/)).toBeInTheDocument()
    const history = screen.getByRole('list', { name: 'Fast Store paket geçmişi' })
    expect(history).toHaveTextContent('Satıcı paket durumunu güncelledi')
    expect(history).toHaveTextContent('İşlemi yapan: Sistem')
    expect(history).toHaveTextContent('Paket durumu güncellendi')
    expect(history).toHaveTextContent('İşlemi yapan: ops-user')
  })

  it('renders shipping address with postal code and generic fallback for unknown order events', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([
      adminOrder({
        shipping_address: {
          label: 'Ev',
          recipient_name: 'Ada Buyer',
          phone: '+905551234567',
          city: 'Istanbul',
          district: 'Kadikoy',
          address_line: 'Example Street 1',
          postal_code: '34710',
        },
        delivery_method: 'standard',
        history: [
          {
            action: 'some_future_action',
            from_status: null,
            to_status: 'paid',
            reason: null,
            created_at: '2026-11-04T20:05:00Z',
            actor_subject: null,
          },
        ],
      }),
    ] as AdminOrder[])

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText(/34710/)).toBeInTheDocument()
    expect(screen.getByText('Sipariş güncellendi')).toBeInTheDocument()
  })

  it('shows the empty state without an error when the order list is empty', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([])

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText('Henüz sipariş bulunmuyor.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a status update failure without changing the order', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([adminOrder()] as AdminOrder[])
    vi.mocked(updateAdminOrderStatus).mockRejectedValueOnce(new Error('conflict'))
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    await user.click(await screen.findByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş #21 güncellenemedi. Durumu yenileyip tekrar dene.',
    )
  })

  it('ignores refund requests with a reason shorter than five characters', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([adminOrder()] as AdminOrder[])
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    const reason = await screen.findByLabelText('İptal/iade nedeni')
    await user.type(reason, 'abc')
    await user.click(screen.getByRole('button', { name: 'İptal et ve yerel iade kaydı oluştur' }))

    expect(refundAdminOrder).not.toHaveBeenCalled()
  })

  it('reports a refund failure when the refund API rejects the request', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([adminOrder()] as AdminOrder[])
    vi.mocked(refundAdminOrder).mockRejectedValueOnce(new Error('server'))
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    const reason = await screen.findByLabelText('İptal/iade nedeni')
    await user.type(reason, 'Customer requested refund')
    await user.click(screen.getByRole('button', { name: 'İptal et ve yerel iade kaydı oluştur' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş #21 için iade kaydı oluşturulamadı.',
    )
  })
})

describe('SellerApplicationPanel coverage gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the approved message and hides the form for approved applications', async () => {
    vi.mocked(getMySellerApplication).mockResolvedValue(application({ status: 'approved' }))

    render(<SellerApplicationPanel token="buyer-token" />)

    expect(await screen.findByText(/başvurun onaylandı/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Taslağı kaydet' })).not.toBeInTheDocument()
  })

  it('shows the rejected message for rejected applications', async () => {
    vi.mocked(getMySellerApplication).mockResolvedValue(application({ status: 'rejected' }))

    render(<SellerApplicationPanel token="buyer-token" />)

    expect(await screen.findByText(/başvurun reddedildi/)).toBeInTheDocument()
  })

  it('shows the approval-in-progress message and applicant note without an editable form', async () => {
    vi.mocked(getMySellerApplication).mockResolvedValue(
      application({ status: 'approval_pending', applicant_note: 'Belgeler tamam' }),
    )

    render(<SellerApplicationPanel token="buyer-token" />)

    expect(await screen.findByText(/satıcı erişimin hazırlanıyor/)).toBeInTheDocument()
    expect(screen.getByText('Belgeler tamam')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Başvuruyu düzenle' })).not.toBeInTheDocument()
  })

})
