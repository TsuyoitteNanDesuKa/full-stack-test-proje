import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  createAddress,
  deleteAddress,
  updateAddress,
} from './api'
import type { AddressRequest, CustomerAddress } from './api'

interface AddressBookPanelProps {
  token: string
  addresses: CustomerAddress[]
  isLoading: boolean
  loadError: string
  onRetry: () => void
  onSaved: () => void
}

interface AddressFormState {
  label: string
  recipient_name: string
  phone: string
  city: string
  district: string
  address_line: string
  postal_code: string
  is_default: boolean
}

const emptyAddress: AddressFormState = {
  label: '',
  recipient_name: '',
  phone: '',
  city: '',
  district: '',
  address_line: '',
  postal_code: '',
  is_default: false,
}

export default function AddressBookPanel({
  token,
  addresses,
  isLoading,
  loadError,
  onRetry,
  onSaved,
}: AddressBookPanelProps) {
  const [form, setForm] = useState<AddressFormState>(emptyAddress)
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingAddressId, setDeletingAddressId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function editAddress(address: CustomerAddress) {
    setEditingAddressId(address.id)
    setForm({
      label: address.label,
      recipient_name: address.recipient_name,
      phone: address.phone,
      city: address.city,
      district: address.district,
      address_line: address.address_line,
      postal_code: address.postal_code ?? '',
      is_default: address.is_default,
    })
    setError('')
    setNotice('')
  }

  function resetForm() {
    setEditingAddressId(null)
    setForm(emptyAddress)
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')
    const requestBody: AddressRequest = {
      ...form,
      postal_code: form.postal_code.trim() || null,
    }
    try {
      if (editingAddressId === null) {
        await createAddress(token, requestBody)
        setNotice('Adres kaydedildi.')
      } else {
        await updateAddress(token, editingAddressId, requestBody)
        setNotice('Adres güncellendi.')
      }
      resetForm()
      onSaved()
    } catch (saveError) {
      setError(
        saveError instanceof ApiError && saveError.status === 422
          ? 'Adres bilgilerini ve telefon biçimini kontrol et.'
          : 'Adres kaydedilemedi. Lütfen tekrar dene.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function removeAddress(addressId: number) {
    setDeletingAddressId(addressId)
    setError('')
    setNotice('')
    try {
      await deleteAddress(token, addressId)
      if (editingAddressId === addressId) resetForm()
      setNotice('Adres silindi. Önceki siparişlerdeki adres bilgileri korunur.')
      onSaved()
    } catch {
      setError('Adres silinemedi. Lütfen adres listesini yenileyip tekrar dene.')
    } finally {
      setDeletingAddressId(null)
    }
  }

  return (
    <section aria-labelledby="address-book-heading" className="seller-panel address-book-panel">
      <div className="seller-panel-heading">
        <div>
          <span className="products-kicker">TESLİMAT</span>
          <h2 id="address-book-heading">Adres defterim</h2>
        </div>
        <button className="retry-button" onClick={onRetry} type="button">Yenile</button>
      </div>
      <p className="admin-orders-disclaimer">
        Siparişe kaydedilen adres, bu listedeki değişikliklerden etkilenmez.
      </p>
      {(error || loadError) && (
        <div className="products-error" role="alert">
          <p>{error || loadError}</p>
          {loadError && <button className="retry-button" onClick={onRetry} type="button">Tekrar dene</button>}
        </div>
      )}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {isLoading ? (
        <p className="products-status" role="status">Adresler yükleniyor...</p>
      ) : addresses.length === 0 ? (
        <p className="store-empty">Henüz kayıtlı adresin yok.</p>
      ) : (
        <ul aria-label="Kayıtlı adresler" className="customer-address-list">
          {addresses.map((address) => (
            <li className="customer-address-card" key={address.id}>
              <div>
                <h3>{address.label}{address.is_default ? ' · Varsayılan' : ''}</h3>
                <p>{address.recipient_name} · {address.phone}</p>
                <p>{address.address_line}, {address.district}, {address.city}</p>
                {address.postal_code && <p>Posta kodu: {address.postal_code}</p>}
              </div>
              <div className="customer-address-actions">
                <button className="retry-button" onClick={() => editAddress(address)} type="button">
                  Düzenle
                </button>
                {!address.is_default && (
                  <button
                    className="retry-button"
                    onClick={() => editAddress({ ...address, is_default: true })}
                    type="button"
                  >
                    Varsayılan yap
                  </button>
                )}
                <button
                  className="delete-product-button"
                  disabled={deletingAddressId === address.id}
                  onClick={() => void removeAddress(address.id)}
                  type="button"
                >
                  {deletingAddressId === address.id ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="address-form" onSubmit={(event) => void saveAddress(event)}>
        <h3>{editingAddressId === null ? 'Yeni adres ekle' : 'Adresi düzenle'}</h3>
        <label>
          Adres başlığı
          <input
            maxLength={40}
            minLength={1}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            required
            value={form.label}
          />
        </label>
        <label>
          Alıcı adı
          <input
            autoComplete="name"
            maxLength={120}
            minLength={2}
            onChange={(event) => setForm({ ...form, recipient_name: event.target.value })}
            required
            value={form.recipient_name}
          />
        </label>
        <label>
          Telefon
          <input
            autoComplete="tel"
            maxLength={24}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="+90 5xx xxx xx xx"
            required
            type="tel"
            value={form.phone}
          />
        </label>
        <div className="address-form-grid">
          <label>
            İl
            <input
              maxLength={80}
              minLength={2}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              required
              value={form.city}
            />
          </label>
          <label>
            İlçe
            <input
              maxLength={80}
              minLength={2}
              onChange={(event) => setForm({ ...form, district: event.target.value })}
              required
              value={form.district}
            />
          </label>
        </div>
        <label>
          Açık adres
          <textarea
            maxLength={250}
            minLength={5}
            onChange={(event) => setForm({ ...form, address_line: event.target.value })}
            required
            value={form.address_line}
          />
        </label>
        <label>
          Posta kodu (isteğe bağlı)
          <input
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => setForm({ ...form, postal_code: event.target.value })}
            pattern="[0-9]{5}"
            value={form.postal_code}
          />
        </label>
        <label className="address-default-option">
          <input
            checked={form.is_default}
            onChange={(event) => setForm({ ...form, is_default: event.target.checked })}
            type="checkbox"
          />
          Varsayılan teslimat adresim yap
        </label>
        <div className="customer-address-actions">
          <button className="checkout-button" disabled={isSaving} type="submit">
            {isSaving ? 'Kaydediliyor...' : editingAddressId === null ? 'Adresi kaydet' : 'Değişiklikleri kaydet'}
          </button>
          {editingAddressId !== null && (
            <button className="retry-button" onClick={resetForm} type="button">Vazgeç</button>
          )}
        </div>
      </form>
    </section>
  )
}
