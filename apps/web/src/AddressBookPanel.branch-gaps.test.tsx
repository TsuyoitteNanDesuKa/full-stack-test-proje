import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AddressBookPanel from './AddressBookPanel'
import type { CustomerAddress } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  createAddress: vi.fn(),
  deleteAddress: vi.fn(),
  updateAddress: vi.fn(),
}))

const homeAddress: CustomerAddress = {
  id: 8,
  label: 'Ev',
  recipient_name: 'Ada Buyer',
  phone: '+905551234567',
  city: 'Istanbul',
  district: 'Kadikoy',
  address_line: 'Example Street 1',
  postal_code: null,
  is_default: true,
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
}

const officeAddress: CustomerAddress = {
  ...homeAddress,
  id: 9,
  label: 'Ofis',
  is_default: false,
}

describe('AddressBookPanel branch gaps', () => {
  it('shows the load error with a retry action that calls onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()

    render(
      <AddressBookPanel
        addresses={[]}
        isLoading={false}
        loadError="Adresler yüklenemedi."
        onRetry={onRetry}
        onSaved={vi.fn()}
        token="buyer-token"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Adresler yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('opens the edit form with the default option preselected for a non-default address', async () => {
    const user = userEvent.setup()

    render(
      <AddressBookPanel
        addresses={[homeAddress, officeAddress]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={vi.fn()}
        token="buyer-token"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Varsayılan yap' }))

    expect(screen.getByRole('heading', { name: 'Adresi düzenle' })).toBeInTheDocument()
    expect(screen.getByLabelText('Varsayılan teslimat adresim yap')).toBeChecked()
  })
})
