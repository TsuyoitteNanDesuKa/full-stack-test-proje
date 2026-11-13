import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AddressBookPanel from './AddressBookPanel'
import type { CustomerAddress } from './api'
import { ApiError, createAddress, deleteAddress, updateAddress } from './api'

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  createAddress: vi.fn(),
  deleteAddress: vi.fn(),
  updateAddress: vi.fn(),
}))

const savedAddress: CustomerAddress = {
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

describe('AddressBookPanel', () => {
  const onSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAddress).mockResolvedValue(savedAddress)
    vi.mocked(updateAddress).mockResolvedValue(savedAddress)
    vi.mocked(deleteAddress).mockResolvedValue(undefined)
  })

  it('creates an address and refreshes the address book', async () => {
    const user = userEvent.setup()
    render(
      <AddressBookPanel
        addresses={[]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={onSaved}
        token="buyer-token"
      />,
    )

    await user.type(screen.getByLabelText('Adres başlığı'), 'Ev')
    await user.type(screen.getByLabelText('Alıcı adı'), 'Ada Buyer')
    await user.type(screen.getByLabelText('Telefon'), '+905551234567')
    await user.type(screen.getByLabelText('İl'), 'Istanbul')
    await user.type(screen.getByLabelText('İlçe'), 'Kadikoy')
    await user.type(screen.getByLabelText('Açık adres'), 'Example Street 1')
    await user.click(screen.getByLabelText('Varsayılan teslimat adresim yap'))
    await user.click(screen.getByRole('button', { name: 'Adresi kaydet' }))

    await waitFor(() => expect(createAddress).toHaveBeenCalledWith(
      'buyer-token',
      {
        label: 'Ev',
        recipient_name: 'Ada Buyer',
        phone: '+905551234567',
        city: 'Istanbul',
        district: 'Kadikoy',
        address_line: 'Example Street 1',
        postal_code: null,
        is_default: true,
      },
    ))
    expect(await screen.findByRole('status')).toHaveTextContent('Adres kaydedildi.')
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('edits and deletes an address while preserving the snapshot notice', async () => {
    const user = userEvent.setup()
    render(
      <AddressBookPanel
        addresses={[savedAddress]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={onSaved}
        token="buyer-token"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Düzenle' }))
    await user.clear(screen.getByLabelText('Adres başlığı'))
    await user.type(screen.getByLabelText('Adres başlığı'), 'Ofis')
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    await waitFor(() => expect(updateAddress).toHaveBeenCalledWith(
      'buyer-token',
      savedAddress.id,
      expect.objectContaining({ label: 'Ofis' }),
    ))

    expect(screen.getByText('Siparişe kaydedilen adres, bu listedeki değişikliklerden etkilenmez.'))
      .toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sil' }))
    await waitFor(() => expect(deleteAddress).toHaveBeenCalledWith('buyer-token', savedAddress.id))
    expect(onSaved).toHaveBeenCalledTimes(2)
  })

  it('reports address validation errors and permits retrying the edit', async () => {
    vi.mocked(updateAddress).mockRejectedValueOnce(new ApiError('invalid', 422))
    const user = userEvent.setup()
    render(
      <AddressBookPanel
        addresses={[savedAddress]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={onSaved}
        token="buyer-token"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Düzenle' }))
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Adres bilgilerini ve telefon biçimini kontrol et.',
    )
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Adres güncellendi.')
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('keeps the edit form after a failed delete and resets it after a successful retry', async () => {
    vi.mocked(deleteAddress).mockRejectedValueOnce(new Error('delete failed'))
    const user = userEvent.setup()
    render(
      <AddressBookPanel
        addresses={[savedAddress]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={onSaved}
        token="buyer-token"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Düzenle' }))
    await user.click(screen.getByRole('button', { name: 'Sil' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Adres silinemedi.')
    expect(screen.getByRole('heading', { name: 'Adresi düzenle' })).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sil' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Adres silindi.')
    expect(screen.getByRole('heading', { name: 'Yeni adres ekle' })).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('lets the buyer make another address the default and set its postal code', async () => {
    const user = userEvent.setup()
    render(
      <AddressBookPanel
        addresses={[{ ...savedAddress, is_default: false }]}
        isLoading={false}
        loadError=""
        onRetry={vi.fn()}
        onSaved={onSaved}
        token="buyer-token"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Varsayılan yap' }))
    expect(screen.getByLabelText('Varsayılan teslimat adresim yap')).toBeChecked()
    await user.type(screen.getByLabelText('Posta kodu (isteğe bağlı)'), '34710')
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    await waitFor(() => expect(updateAddress).toHaveBeenCalledWith(
      'buyer-token',
      savedAddress.id,
      expect.objectContaining({ is_default: true, postal_code: '34710' }),
    ))
  })
})
