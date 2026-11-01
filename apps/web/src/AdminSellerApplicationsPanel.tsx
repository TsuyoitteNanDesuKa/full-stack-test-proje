import { useCallback, useEffect, useState } from 'react'
import {
  getSellerApplications,
  reviewSellerApplication,
} from './api'
import type {
  AdminSellerApplication,
  SellerApplicationReviewAction,
} from './api'

const statusLabels: Record<AdminSellerApplication['status'], string> = {
  draft: 'Taslak',
  submitted: 'Gönderildi',
  under_review: 'İnceleniyor',
  changes_requested: 'Düzenleme bekleniyor',
  approval_pending: 'Onay işlemi sürüyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  withdrawn: 'Geri çekildi',
}

export default function AdminSellerApplicationsPanel({ token }: { token: string }) {
  const [applications, setApplications] = useState<AdminSellerApplication[] | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [applicantNote, setApplicantNote] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      setApplications(await getSellerApplications(token))
    } catch {
      setError('Satıcı başvuruları yüklenemedi. Lütfen tekrar dene.')
      setApplications([])
    }
  }, [token])

  const isLoading = applications === null
  const displayedApplications = applications ?? []

  useEffect(() => {
    let active = true
    getSellerApplications(token)
      .then((loaded) => {
        if (active) setApplications(loaded)
      })
      .catch(() => {
        if (active) {
          setError('Satıcı başvuruları yüklenemedi. Lütfen tekrar dene.')
          setApplications([])
        }
      })
    return () => {
      active = false
    }
  }, [token])

  async function review(application: AdminSellerApplication, action: SellerApplicationReviewAction) {
    setError('')
    setNotice('')
    setActiveId(application.id)
    try {
      const updated = await reviewSellerApplication(token, application.id, {
        action,
        ...(action === 'request_changes' ? { applicant_note: applicantNote } : {}),
        ...(adminNote ? { admin_note: adminNote } : {}),
      })
      setApplications((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      )
      setApplicantNote('')
      setAdminNote('')
      setNotice('Başvuru kararı kaydedildi.')
    } catch {
      setError(
        action === 'approve'
          ? 'Başvuru onaylanamadı. Rol atama işlemini ve Keycloak bağlantısını kontrol et.'
          : 'Başvuru güncellenemedi. Lütfen tekrar dene.',
      )
    } finally {
      setActiveId(null)
    }
  }

  return (
    <section aria-labelledby="admin-seller-heading" className="seller-panel">
      <div className="seller-panel-heading">
        <div>
          <span className="products-kicker">YÖNETİM</span>
          <h2 id="admin-seller-heading">Satıcı başvuruları</h2>
        </div>
        <button className="retry-button" onClick={() => void refresh()} type="button">
          Yenile
        </button>
      </div>
      {error && <p className="products-error" role="alert">{error}</p>}
      {notice && <p className="application-notice" role="status">{notice}</p>}
      {isLoading ? (
        <p className="products-status" role="status">Başvurular yükleniyor...</p>
      ) : displayedApplications.length === 0 ? (
        <p className="store-empty">Henüz satıcı başvurusu bulunmuyor.</p>
      ) : (
        <div className="seller-application-list">
          {displayedApplications.map((application) => (
            <article className="seller-application-card" key={application.id}>
              <div className="seller-panel-heading">
                <h3>{application.store_name}</h3>
                <span className="application-status">{statusLabels[application.status]}</span>
              </div>
              <dl className="seller-application-details">
                <div><dt>Başvuru sahibi</dt><dd>{application.legal_name}</dd></div>
                <div><dt>Tür</dt><dd>{application.applicant_type}</dd></div>
                <div><dt>Yetkili</dt><dd>{application.representative_name || 'Belirtilmedi'}</dd></div>
                <div><dt>İletişim</dt><dd>{application.contact_phone}</dd></div>
                <div><dt>Konum</dt><dd>{application.district}, {application.city}</dd></div>
                <div><dt>Kategori</dt><dd>{application.primary_category}</dd></div>
                <div><dt>Başvuru açıklaması</dt><dd>{application.business_description}</dd></div>
                <div><dt>Başvuru sahibi notu</dt><dd>{application.applicant_note || 'Yok'}</dd></div>
                {application.admin_note && (
                  <div><dt>Önceki yönetici notu</dt><dd>{application.admin_note}</dd></div>
                )}
              </dl>
              {['submitted', 'under_review', 'approval_pending'].includes(application.status) && (
                <div className="seller-review-fields">
                  <label>
                    Başvuru sahibine not
                    <textarea
                      onChange={(event) => setApplicantNote(event.target.value)}
                      value={applicantNote}
                    />
                  </label>
                  <label>
                    Yönetici notu
                    <textarea
                      onChange={(event) => setAdminNote(event.target.value)}
                      value={adminNote}
                    />
                  </label>
                </div>
              )}
              <div className="seller-form-actions">
                {application.status === 'submitted' && (
                  <button
                    className="retry-button"
                    disabled={activeId !== null}
                    onClick={() => void review(application, 'begin_review')}
                    type="button"
                  >
                    İncelemeye al
                  </button>
                )}
                {['under_review', 'approval_pending'].includes(application.status) && (
                  <>
                    {application.status === 'under_review' && (
                      <>
                        <button
                          className="retry-button"
                          disabled={activeId !== null || !applicantNote.trim()}
                          onClick={() => void review(application, 'request_changes')}
                          type="button"
                        >
                          Düzenleme iste
                        </button>
                        <button
                          className="delete-product-button"
                          disabled={activeId !== null || !applicantNote.trim()}
                          onClick={() => void review(application, 'reject')}
                          type="button"
                        >
                          Reddet
                        </button>
                      </>
                    )}
                    <button
                      className="add-product-button"
                      disabled={activeId !== null}
                      onClick={() => void review(application, 'approve')}
                      type="button"
                    >
                      {activeId === application.id ? 'İşleniyor...' : 'Onayla'}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
