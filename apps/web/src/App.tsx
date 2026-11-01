import { useEffect, useState } from 'react'
import './App.css'
import { deleteProduct, getCurrentUser, getHome, getProducts } from './api'
import type { Product } from './api'
import { beginLogin, beginRegistration, endSession, getCurrentSession } from './auth'
import AdminSellerApplicationsPanel from './AdminSellerApplicationsPanel'
import ProductCreatePage from './ProductCreatePage'
import SellerApplicationPanel from './SellerApplicationPanel'

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M16 27c-7-3-11-8-10-14 1-5 5-7 10-5 5-2 9 0 10 5 1 6-3 11-10 14Z"
          fill="currentColor"
        />
        <path d="M16 25c0-6 2-10 7-14" stroke="#f8f6f0" strokeWidth="1.5" />
      </svg>
    </span>
  )
}

function LoginPage({
  onLogin,
  onRegister,
  error,
}: {
  onLogin: () => Promise<void>
  onRegister: () => Promise<void>
  error: string | null
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [redirectError, setRedirectError] = useState('')

  async function redirectToIdentityProvider(action: () => Promise<void>) {
    setIsSubmitting(true)
    setRedirectError('')
    try {
      await action()
    } catch {
      setRedirectError('Kimlik sağlayıcısına bağlanılamadı. Lütfen tekrar dene.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="welcome-panel" aria-label="Liva mağaza">
        <a className="brand" href="/" aria-label="Liva ana sayfa">
          <BrandMark />
          <span>liva</span>
        </a>
        <div className="welcome-copy">
          <span className="eyebrow"><span className="eyebrow-dot" />GÜZEL ŞEYLER, GÜZEL HİSSETTİRİR</span>
          <h1>Kendine<br />iyi bak.<span className="headline-accent">Gerisi gelir.</span></h1>
          <p>Günlük hayatına küçük bir güzellik katacak özenle seçilmiş ürünler seni bekliyor.</p>
        </div>
        <div className="showcase" aria-hidden="true">
          <div className="showcase-orbit showcase-orbit-one" />
          <div className="showcase-orbit showcase-orbit-two" />
          <div className="showcase-sun" />
          <div className="showcase-leaf leaf-one" />
          <div className="showcase-leaf leaf-two" />
          <div className="showcase-leaf leaf-three" />
          <div className="showcase-vase"><div className="vase-neck" /><div className="vase-body"><span className="vase-highlight" /></div></div>
          <div className="showcase-card"><span className="showcase-card-icon">✳</span><span><strong>Biraz kendin için</strong><small>Güzel şeyler burada başlar.</small></span><span className="showcase-arrow">↗</span></div>
          <span className="showcase-caption">GÜNÜN EN GÜZEL ANI</span>
        </div>
        <div className="panel-footer"><span>İyi hissetmenin küçük bir yolu.</span><span className="footer-sparkle">✳</span></div>
      </section>
      <section className="form-panel">
        <div className="form-topline">
          <span>Aramıza hoş geldin</span>
          <span className="secure-label">GÜVENLİ GİRİŞ</span>
        </div>
        <div className="form-content">
          <div className="form-heading">
            <span className="heading-kicker">LIVA DÜNYASINA GİR</span>
            <h2>Merhaba<span>.</span></h2>
            <p>Hesabınla güvenli şekilde giriş yap veya yeni bir alıcı hesabı oluştur.</p>
          </div>
          {(error || redirectError) && (
            <p className="form-error" role="alert">{error ?? redirectError}</p>
          )}
          <button
            className="submit-button"
            disabled={isSubmitting}
            onClick={() => void redirectToIdentityProvider(onLogin)}
            type="button"
          >
            <span>Giriş yap</span><span className="submit-arrow">↗</span>
          </button>
          <div className="form-divider"><span /><span>VEYA</span><span /></div>
          <button
            className="submit-button"
            disabled={isSubmitting}
            onClick={() => void redirectToIdentityProvider(onRegister)}
            type="button"
          >
            <span>Alıcı hesabı oluştur</span><span className="submit-arrow">↗</span>
          </button>
          <p className="privacy-note">
            Giriş yaparak <a href="#terms">Kullanım Koşulları</a> ve{' '}
            <a href="#privacy">Gizlilik Politikası</a>'nı kabul etmiş olursun.
          </p>
        </div>
        <div className="form-footer"><span>© 2026 Liva</span><span>Senin için, özenle.</span></div>
      </section>
    </main>
  )
}

function HomePage({
  email,
  message,
  token,
  isAdmin,
  roles = [],
  onLogout,
  sessionError,
}: {
  email: string
  message: string
  token: string
  isAdmin: boolean
  roles: string[]
  onLogout: () => void
  sessionError: string | null
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [showSellerApplications, setShowSellerApplications] = useState(false)
  const canCreateProducts = isAdmin || roles.includes('seller')

  useEffect(() => {
    let active = true
    getProducts(token)
      .then((response) => {
        if (active) {
          setProducts(response.products)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof TypeError
              ? 'Ürünlere şu anda ulaşılamıyor. Sunucu bağlantısını kontrol edip tekrar dene.'
              : 'Ürünler yüklenemedi. Lütfen tekrar dene.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [retryCount, token])

  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })

  async function handleDeleteProduct(product: Product) {
    if (
      !window.confirm(
        `"${product.name}" ürününü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      )
    ) {
      return
    }

    setDeleteError('')
    setDeletingProductId(product.id)
    try {
      await deleteProduct(token, product.id)
      setProducts((currentProducts) =>
        currentProducts.filter((currentProduct) => currentProduct.id !== product.id),
      )
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof TypeError
          ? 'Sunucuya bağlanılamadı. Ürün silinemedi; tekrar deneyin.'
          : 'Ürün silinemedi. Lütfen tekrar dene.',
      )
    } finally {
      setDeletingProductId(null)
    }
  }

  if ((isCreatingProduct || editingProduct !== null) && canCreateProducts) {
    return (
      <ProductCreatePage
        key={editingProduct?.id ?? 'new'}
        onCancel={() => {
          setIsCreatingProduct(false)
          setEditingProduct(null)
        }}
        onSaved={(product) => {
          setProducts((currentProducts) =>
            editingProduct === null
              ? [product, ...currentProducts]
              : currentProducts.map((currentProduct) =>
                  currentProduct.id === product.id ? product : currentProduct,
                ),
          )
          setIsCreatingProduct(false)
          setEditingProduct(null)
        }}
        product={editingProduct ?? undefined}
        token={token}
      />
    )
  }

  if (showSellerApplications && isAdmin) {
    return (
      <main className="store-home">
        <header className="store-header">
          <a className="brand store-brand" href="/" aria-label="Liva ana sayfa">
            <BrandMark />
            <span>liva</span>
          </a>
          <button
            className="retry-button"
            onClick={() => setShowSellerApplications(false)}
            type="button"
          >
            Mağazaya dön
          </button>
        </header>
        <AdminSellerApplicationsPanel token={token} />
      </main>
    )
  }

  return (
    <main className="store-home">
      <header className="store-header">
        <a className="brand store-brand" href="/" aria-label="Liva ana sayfa">
          <BrandMark />
          <span>liva</span>
        </a>
        <span className="store-header-note">KÜÇÜK GÜZELLİKLER, HER GÜN</span>
        <button className="logout-button" onClick={onLogout} type="button">
          Çıkış yap <span aria-hidden="true">↗</span>
        </button>
      </header>
      {sessionError && (
        <p className="products-error" role="alert">{sessionError}</p>
      )}
      <section className="store-welcome">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          LIVA DÜNYASINA HOŞ GELDİN
        </span>
        <h1>{message}<span>.</span></h1>
        <p>{email} olarak giriş yaptın. Sana iyi gelecek şeyler burada başlıyor.</p>
        {roles.includes('seller') && (
          <p className="application-notice" role="status">Satıcı hesabın aktif.</p>
        )}
      </section>
      {isAdmin ? (
        <button
          className="retry-button"
          onClick={() => setShowSellerApplications(true)}
          type="button"
        >
          Satıcı başvurularını yönet
        </button>
      ) : (
        <SellerApplicationPanel token={token} />
      )}
      <section aria-labelledby="products-heading" className="products-section">
        <div className="products-heading-row">
          <div>
            <span className="products-kicker">LIVA SEÇKİSİ</span>
            <h2 id="products-heading">Sana iyi gelecek ürünler</h2>
          </div>
          {!isLoading && !error && (
            <span className="products-count">{products.length} ürün</span>
          )}
          {canCreateProducts && (
            <button
              className="add-product-button"
              onClick={() => setIsCreatingProduct(true)}
              type="button"
            >
              + Ürün ekle
            </button>
          )}
        </div>
        {deleteError && (
          <div className="products-error" role="alert">
            <p>{deleteError}</p>
          </div>
        )}
        {isLoading ? (
          <p className="products-status" role="status">Ürünler yükleniyor...</p>
        ) : error ? (
          <div className="products-error" role="alert">
            <p>{error}</p>
            <button
              className="retry-button"
              onClick={() => {
                setError('')
                setIsLoading(true)
                setRetryCount((count) => count + 1)
              }}
              type="button"
            >
              Tekrar dene
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="store-empty">
            <span aria-hidden="true">✳</span>
            <p>Henüz listelenecek ürün yok.</p>
            <small>Yeni ürünler eklendiğinde burada görebilirsin.</small>
          </div>
        ) : (
          <div className="product-table-scroll">
            <table aria-label="Ürün listesi" className="product-table">
              <thead>
                <tr>
                  <th scope="col">Ürün</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Açıklama</th>
                  <th scope="col">Fiyat</th>
                  <th scope="col">Stok</th>
                  {canCreateProducts && <th scope="col">İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <th scope="row">
                      {product.name}
                      {product.updated_at && (
                        <time
                          className="product-updated-badge"
                          dateTime={product.updated_at}
                          title={`Son güncelleme: ${new Date(product.updated_at).toLocaleString('tr-TR')}`}
                        >
                          Güncellendi
                        </time>
                      )}
                    </th>
                    <td><span className="product-category">{product.category}</span></td>
                    <td className="product-description">{product.description}</td>
                    <td className="product-price">{formatter.format(Number(product.price))}</td>
                    <td>{product.stock}</td>
                    {canCreateProducts && (
                      <td>
                        {(isAdmin || product.can_manage) && (
                          <>
                            <button
                              aria-label={`Düzenle ${product.name}`}
                              className="edit-product-button"
                              onClick={() => setEditingProduct(product)}
                              type="button"
                            >
                              Düzenle
                            </button>
                            <button
                              aria-label={`Sil ${product.name}`}
                              className="delete-product-button"
                              disabled={deletingProductId === product.id}
                              onClick={() => void handleDeleteProduct(product)}
                              type="button"
                            >
                              {deletingProductId === product.id ? 'Siliniyor...' : 'Sil'}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <footer className="store-footer">© 2026 Liva <span>Senin için, özenle.</span></footer>
    </main>
  )
}

function App() {
  const [home, setHome] = useState<{
    email: string
    message: string
    token: string
    isAdmin: boolean
    roles: string[]
  } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function initializeSession() {
      try {
        const session = await getCurrentSession()
        if (!session) {
          return
        }

        const [identity, homeResponse] = await Promise.all([
          getCurrentUser(session.accessToken),
          getHome(session.accessToken),
        ])
        if (active) {
          setHome({
            email: identity.email || session.email || 'Hesabın',
            message: homeResponse.message,
            token: session.accessToken,
            isAdmin: identity.is_admin,
            roles: identity.roles,
          })
        }
      } catch {
        if (active) {
          setAuthError('Oturum başlatılamadı. Kimlik sağlayıcısı ve API bağlantısını kontrol et.')
        }
      } finally {
        if (active) {
          setIsInitializing(false)
        }
      }
    }

    void initializeSession()
    return () => {
      active = false
    }
  }, [])

  if (home) {
    return (
      <HomePage
        email={home.email}
        isAdmin={home.isAdmin}
        roles={home.roles}
        message={home.message}
        sessionError={authError}
        onLogout={() => {
          void endSession().catch(() => {
            setAuthError('Oturum kapatılamadı. Lütfen tekrar dene.')
          })
        }}
        token={home.token}
      />
    )
  }

  if (isInitializing) {
    return <p className="products-status" role="status">Oturum kontrol ediliyor...</p>
  }

  return (
    <LoginPage
      error={authError}
      onLogin={beginLogin}
      onRegister={beginRegistration}
    />
  )
}

export default App
