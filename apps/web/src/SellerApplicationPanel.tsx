import { useEffect, useState } from 'react'
import {
  createSellerApplication,
  getMySellerApplication,
  submitMySellerApplication,
  updateMySellerApplication,
  withdrawMySellerApplication,
} from './api'
import type {
  SellerApplication,
  SellerApplicationRequest,
  SellerApplicantType,
} from './api'

const emptyApplication: SellerApplicationRequest = {
  applicant_type: 'individual',
  legal_name: '',
  representative_name: '',
  store_name: '',
  contact_phone: '',
  city: '',
  district: '',
  primary_category: '',
  business_description: '',
}

const statusLabels: Record<SellerApplication['status'], string> = {
  draft: 'Taslak',
  submitted: 'Gönderildi',
  under_review: 'İnceleniyor',
  changes_requested: 'Düzenleme bekleniyor',
  approval_pending: 'Onay işlemi sürüyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  withdrawn: 'Geri çekildi',
}

function applicationToRequest(
  application: SellerApplication,
): SellerApplicationRequest {
  return {
    applicant_type: application.applicant_type,
    legal_name: application.legal_name,
    representative_name: application.representative_name,
    store_name: application.store_name,
    contact_phone: application.contact_phone,
    city: application.city,
    district: application.district,
    primary_category: application.primary_category,
    business_description: application.business_description,
  }
}

export default function SellerApplicationPanel({ token }: { token: string }) {
  const [application, setApplication] = useState<SellerApplication | null>(null)
  const [form, setForm] = useState<SellerApplicationRequest>(emptyApplication)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    getMySellerApplication(token)
      .then((loaded) => {
        if (active && loaded) {
          setApplication(loaded)
          setForm(applicationToRequest(loaded))
          setIsFormOpen(
            loaded.status === 'draft' || loaded.status === 'changes_requested',
          )
        }
      })
      .catch(() => {
        if (active) setError('Satıcı başvurusu yüklenemedi. Lütfen tekrar dene.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const editable =
    application === null ||
    application.status === 'draft' ||
    application.status === 'changes_requested'

  function updateField<K extends keyof SellerApplicationRequest>(
    key: K,
    value: SellerApplicationRequest[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<SellerApplication> {
    const saved = application
      ? await updateMySellerApplication(token, form)
      : await createSellerApplication(token, form)
    setApplication(saved)
    setForm(applicationToRequest(saved))
    return saved
  }

  async function handleSave(submit: boolean) {
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      await save()
      if (submit) {
        const submitted = await submitMySellerApplication(token)
        setApplication(submitted)
        setNotice('Başvurun inceleme için gönderildi.')
      } else {
        setNotice('Başvuru taslağın kaydedildi.')
      }
    } catch {
      setError('Başvuru kaydedilemedi. Bilgileri kontrol edip tekrar dene.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleWithdraw() {
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      const withdrawn = await withdrawMySellerApplication(token)
      setApplication(withdrawn)
      setNotice('Başvurun geri çekildi.')
    } catch {
      setError('Başvuru geri çekilemedi. Lütfen tekrar dene.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section aria-labelledby="seller-application-heading" className="seller-panel">
      <div className="seller-panel-heading">
        <div>
          <span className="products-kicker">LIVA İŞ ORTAKLIĞI</span>
          <h2 id="seller-application-heading">Satıcı başvurusu</h2>
        </div>
        {application && (
          <span className="application-status" role="status">
            {statusLabels[application.status]}
          </span>
        )}
      </div>
      {error && <p className="products-error" role="alert">{error}</p>}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {isLoading ? (
        <p className="products-status" role="status">Başvuru bilgileri yükleniyor...</p>
      ) : application?.status === 'approved' ? (
        <p>Satıcı başvurun onaylandı. Alıcı hesabın ve ürün kataloğu erişimin devam ediyor.</p>
      ) : application?.status === 'rejected' ? (
        <p>Satıcı başvurun reddedildi. Destek ekibiyle iletişime geçebilirsin.</p>
      ) : (
        <>
          {application?.applicant_note && (
            <p className="application-note">
              <strong>Başvuru notu:</strong> {application.applicant_note}
            </p>
          )}
          {application?.status === 'approval_pending' && (
            <p>Başvurun incelendi; satıcı erişimin hazırlanıyor.</p>
          )}
          {editable && !isFormOpen && (
            <div>
              <p>
                Satıcı başvuruları belgeler toplanmadan admin tarafından manuel incelenir.
                Başvuru, satış veya ödeme yetkisi garantisi vermez.
              </p>
              <button
                className="add-product-button"
                onClick={() => setIsFormOpen(true)}
                type="button"
              >
                {application ? 'Başvuruyu düzenle' : 'Satıcı olarak başvur'}
              </button>
            </div>
          )}
          {editable && isFormOpen && (
            <form
              className="seller-application-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave(true)
              }}
            >
              <label>
                Başvuru türü
                <select
                  onChange={(event) =>
                    updateField('applicant_type', event.target.value as SellerApplicantType)
                  }
                  value={form.applicant_type}
                >
                  <option value="individual">Bireysel</option>
                  <option value="sole_proprietor">Şahıs işletmesi</option>
                  <option value="company">Şirket</option>
                </select>
              </label>
              <label>
                Yasal ad / unvan
                <input
                  onChange={(event) => updateField('legal_name', event.target.value)}
                  required
                  value={form.legal_name}
                />
              </label>
              <label>
                Yetkili kişi
                <input
                  onChange={(event) => updateField('representative_name', event.target.value)}
                  required={form.applicant_type === 'company'}
                  value={form.representative_name ?? ''}
                />
              </label>
              <label>
                Mağaza adı
                <input
                  onChange={(event) => updateField('store_name', event.target.value)}
                  required
                  value={form.store_name}
                />
              </label>
              <label>
                İletişim telefonu
                <input
                  onChange={(event) => updateField('contact_phone', event.target.value)}
                  required
                  type="tel"
                  value={form.contact_phone}
                />
              </label>
              <label>
                İl
                <input
                  onChange={(event) => updateField('city', event.target.value)}
                  required
                  value={form.city}
                />
              </label>
              <label>
                İlçe
                <input
                  onChange={(event) => updateField('district', event.target.value)}
                  required
                  value={form.district}
                />
              </label>
              <label>
                Ana ürün kategorisi
                <input
                  onChange={(event) => updateField('primary_category', event.target.value)}
                  required
                  value={form.primary_category}
                />
              </label>
              <label className="seller-description-field">
                İşletme / mağaza açıklaması
                <textarea
                  onChange={(event) => updateField('business_description', event.target.value)}
                  required
                  rows={4}
                  value={form.business_description}
                />
              </label>
              <div className="seller-form-actions">
                <button
                  className="retry-button"
                  disabled={isSaving}
                  onClick={() => void handleSave(false)}
                  type="button"
                >
                  Taslağı kaydet
                </button>
                <button className="add-product-button" disabled={isSaving} type="submit">
                  {isSaving ? 'Kaydediliyor...' : 'Başvuruyu gönder'}
                </button>
              </div>
            </form>
          )}
          {application &&
            ['draft', 'submitted', 'changes_requested'].includes(application.status) && (
              <button
                className="retry-button"
                disabled={isSaving}
                onClick={() => void handleWithdraw()}
                type="button"
              >
                Başvuruyu geri çek
              </button>
            )}
        </>
      )}
    </section>
  )
}
