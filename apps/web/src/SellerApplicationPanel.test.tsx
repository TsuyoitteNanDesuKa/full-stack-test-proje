import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SellerApplicationPanel from './SellerApplicationPanel'
import {
  createSellerApplication,
  getMySellerApplication,
  submitMySellerApplication,
  updateMySellerApplication,
  withdrawMySellerApplication,
} from './api'
import type { SellerApplication } from './api'

vi.mock('./api', () => ({
  createSellerApplication: vi.fn(),
  getMySellerApplication: vi.fn(),
  submitMySellerApplication: vi.fn(),
  updateMySellerApplication: vi.fn(),
  withdrawMySellerApplication: vi.fn(),
}))

const draft: SellerApplication = {
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
}

describe('SellerApplicationPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getMySellerApplication).mockResolvedValue(draft)
  })

  it('reports loading failure', async () => {
    vi.mocked(getMySellerApplication).mockRejectedValueOnce(new Error('network error'))
    render(<SellerApplicationPanel token="buyer-token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Satıcı başvurusu yüklenemedi.')
  })

  it('shows save failure and allows the existing draft to be saved again', async () => {
    vi.mocked(updateMySellerApplication)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(draft)
    const user = userEvent.setup()
    render(<SellerApplicationPanel token="buyer-token" />)

    await user.click(await screen.findByRole('button', { name: 'Taslağı kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Başvuru kaydedilemedi.')
    expect(submitMySellerApplication).not.toHaveBeenCalled()
    expect(createSellerApplication).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }))
    expect(await screen.findByText('Başvuru taslağın kaydedildi.')).toBeInTheDocument()
    expect(updateMySellerApplication).toHaveBeenCalledTimes(2)
  })

  it('reports withdrawal failure and permits a retry', async () => {
    vi.mocked(withdrawMySellerApplication)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ...draft, status: 'withdrawn' })
    const user = userEvent.setup()
    render(<SellerApplicationPanel token="buyer-token" />)

    await user.click(await screen.findByRole('button', { name: 'Başvuruyu geri çek' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Başvuru geri çekilemedi.')
    await user.click(screen.getByRole('button', { name: 'Başvuruyu geri çek' }))
    expect(await screen.findByText('Başvurun geri çekildi.')).toBeInTheDocument()
    expect(withdrawMySellerApplication).toHaveBeenCalledTimes(2)
  })
})
