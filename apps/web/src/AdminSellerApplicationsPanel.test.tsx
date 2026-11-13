import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSellerApplicationsPanel from './AdminSellerApplicationsPanel'
import { getSellerApplications, reviewSellerApplication } from './api'
import type { AdminSellerApplication } from './api'

vi.mock('./api', () => ({
  getSellerApplications: vi.fn(),
  reviewSellerApplication: vi.fn(),
}))

const application: AdminSellerApplication = {
  id: 21,
  owner_subject: 'buyer-subject',
  applicant_type: 'company',
  legal_name: 'Sample Company',
  representative_name: null,
  store_name: 'Sample Store',
  contact_phone: '05551234567',
  city: 'Istanbul',
  district: 'Kadikoy',
  primary_category: 'Care',
  business_description: 'Care products',
  status: 'under_review',
  applicant_note: null,
  admin_note: null,
  reviewer_subject: null,
  reviewed_at: null,
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
}

describe('AdminSellerApplicationsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getSellerApplications).mockResolvedValue([application])
  })

  it('recovers from a loading error when the administrator retries', async () => {
    vi.mocked(getSellerApplications).mockRejectedValueOnce(new Error('network error'))
    const user = userEvent.setup()
    render(<AdminSellerApplicationsPanel token="admin-token" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Satıcı başvuruları yüklenemedi. Lütfen tekrar dene.',
    )
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByRole('heading', { name: 'Sample Store' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getSellerApplications).toHaveBeenCalledTimes(2)
    expect(getSellerApplications).toHaveBeenLastCalledWith('admin-token')
  })

  it('requires an applicant note and submits both notes when requesting changes', async () => {
    vi.mocked(reviewSellerApplication).mockResolvedValue({
      ...application,
      status: 'changes_requested',
    })
    const user = userEvent.setup()
    render(<AdminSellerApplicationsPanel token="admin-token" />)

    const requestChanges = await screen.findByRole('button', { name: 'Düzenleme iste' })
    expect(requestChanges).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeDisabled()
    await user.type(screen.getByLabelText('Başvuru sahibine not'), 'Eksik belge')
    await user.type(screen.getByLabelText('Yönetici notu'), 'Kontrol edildi')
    await user.click(requestChanges)

    await waitFor(() => {
      expect(reviewSellerApplication).toHaveBeenCalledWith('admin-token', 21, {
        action: 'request_changes',
        applicant_note: 'Eksik belge',
        admin_note: 'Kontrol edildi',
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Başvuru kararı kaydedildi.')
    expect(screen.getByText('Düzenleme bekleniyor')).toBeInTheDocument()
  })

  it('shows the provisioning error and allows approval to be retried', async () => {
    vi.mocked(reviewSellerApplication)
      .mockRejectedValueOnce(new Error('provisioning error'))
      .mockResolvedValueOnce({ ...application, status: 'approved' })
    const user = userEvent.setup()
    render(<AdminSellerApplicationsPanel token="admin-token" />)

    await user.click(await screen.findByRole('button', { name: 'Onayla' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Başvuru onaylanamadı. Rol atama işlemini ve Keycloak bağlantısını kontrol et.',
    )
    await user.click(screen.getByRole('button', { name: 'Onayla' }))

    expect(await screen.findByText('Onaylandı')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(reviewSellerApplication).toHaveBeenCalledTimes(2)
    expect(reviewSellerApplication).toHaveBeenLastCalledWith('admin-token', 21, {
      action: 'approve',
    })
  })

  it('reports refresh failures and permits rejecting with an applicant note', async () => {
    vi.mocked(getSellerApplications)
      .mockResolvedValueOnce([application])
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce([application])
    vi.mocked(reviewSellerApplication).mockResolvedValue({ ...application, status: 'rejected' })
    const user = userEvent.setup()
    render(<AdminSellerApplicationsPanel token="admin-token" />)

    await screen.findByText('Sample Store')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Satıcı başvuruları yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    await user.type(await screen.findByLabelText('Başvuru sahibine not'), 'Eksik bilgiler')
    await user.click(screen.getByRole('button', { name: 'Reddet' }))
    await waitFor(() => expect(reviewSellerApplication).toHaveBeenCalledWith(
      'admin-token', 21, { action: 'reject' },
    ))
    expect(await screen.findByText('Reddedildi')).toBeInTheDocument()
  })
})
