import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { ApiError, deleteProduct, getHome, getProducts, login } from './api'
import type { Product } from './api'
import ProductCreatePage from './ProductCreatePage'

class HomeLoadError extends Error {
  constructor(cause: unknown) {
    super('Login was successful but the storefront could not be loaded.', { cause })
    this.name = 'HomeLoadError'
  }
}

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
}: {
  onLogin: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await onLogin(email.trim(), password)
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.status === 401) {
        setError('E-posta adresi veya parola hatalı. Bilgilerini kontrol edip tekrar dene.')
      } else if (loginError instanceof ApiError && loginError.status === 422) {
        setError('E-posta adresi veya parola biçimi geçersiz.')
      } else if (loginError instanceof HomeLoadError) {
        setError('Giriş başarılı ancak ana sayfa açılamadı. Lütfen tekrar dene.')
      } else if (loginError instanceof TypeError) {
        setError('Sunucuya bağlanılamadı. Backend servisinin çalıştığını kontrol et.')
      } else {
        setError('Giriş sırasında bir sorun oluştu. Lütfen tekrar dene.')
      }
    } finally {
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
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            GÜZEL ŞEYLER, GÜZEL HİSSETTİRİR
          </span>
          <h1>
            Kendine
            <br />
            iyi bak.
            <span className="headline-accent">Gerisi gelir.</span>
          </h1>
          <p>
            Günlük hayatına küçük bir güzellik katacak özenle seçilmiş ürünler seni bekliyor.
          </p>
        </div>

        <div className="showcase" aria-hidden="true">
          <div className="showcase-orbit showcase-orbit-one" />
          <div className="showcase-orbit showcase-orbit-two" />
          <div className="showcase-sun" />
          <div className="showcase-leaf leaf-one" />
          <div className="showcase-leaf leaf-two" />
          <div className="showcase-leaf leaf-three" />
          <div className="showcase-vase">
            <div className="vase-neck" />
            <div className="vase-body">
              <span className="vase-highlight" />
            </div>
          </div>
          <div className="showcase-card">
            <span className="showcase-card-icon">✳</span>
            <span>
              <strong>Biraz kendin için</strong>
              <small>Güzel şeyler burada başlar.</small>
            </span>
            <span className="showcase-arrow">↗</span>
          </div>
          <span className="showcase-caption">GÜNÜNÜN EN GÜZEL ANI</span>
        </div>

        <div className="panel-footer">
          <span>İyi hissetmenin küçük bir yolu.</span>
          <span className="footer-sparkle">✳</span>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-topline">
          <span>Aramıza yeniden hoş geldin</span>
          <span className="secure-label">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3.5" y="7" width="9" height="7" rx="2" stroke="currentColor" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" />
            </svg>
            GÜVENLİ GİRİŞ
          </span>
        </div>

        <div className="form-content">
          <div className="form-heading">
            <span className="heading-kicker">LIVA DÜNYASINA GİR</span>
            <h2>Merhaba<span>.</span></h2>
            <p>Hesabına giriş yap, sana iyi gelecek şeyleri keşfet.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="email">
              E-posta adresi
            </label>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2.5" stroke="currentColor" />
                <path d="m4 6 6 4.5L16 6" stroke="currentColor" strokeLinecap="round" />
              </svg>
              <input
                autoComplete="email"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ornek@email.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="password-label-row">
              <label className="field-label" htmlFor="password">
                Parola
              </label>
              <span className="password-hint">Hesabının parolası</span>
            </div>
            <div className="input-wrap">
              <svg className="input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3.25" y="8.25" width="13.5" height="9" rx="2.5" stroke="currentColor" />
                <path d="M6 8V5.75a4 4 0 1 1 8 0V8" stroke="currentColor" />
                <circle cx="10" cy="12.75" r="1" fill="currentColor" />
              </svg>
              <input
                autoComplete="current-password"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Parolanı gir"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? (
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M3 3 17 17M8.6 8.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" />
                    <path
                      d="M7.1 5.2A8.4 8.4 0 0 1 10 4.7c4.3 0 7.3 5.3 7.3 5.3a12 12 0 0 1-2.2 2.6M5.1 6.6A12 12 0 0 0 2.7 10S5.7 15.3 10 15.3a8 8 0 0 0 2-.3"
                      stroke="currentColor"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M2.7 10S5.7 4.7 10 4.7s7.3 5.3 7.3 5.3-3 5.3-7.3 5.3S2.7 10 2.7 10Z"
                      stroke="currentColor"
                    />
                    <circle cx="10" cy="10" r="2.2" stroke="currentColor" />
                  </svg>
                )}
              </button>
            </div>

            {error && (
              <p className="form-error" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}

            <button className="submit-button" disabled={isSubmitting} type="submit">
              <span>{isSubmitting ? 'Giriş yapılıyor...' : 'Giriş yap'}</span>
              {!isSubmitting && <span className="submit-arrow">↗</span>}
              {isSubmitting && <span aria-hidden="true" className="loading-spinner" />}
            </button>
          </form>

          <div className="form-divider">
            <span />
            <span>İYİ Kİ BURADASIN</span>
            <span />
          </div>

          <p className="signup-note">
            Henüz bir hesabın yok mu? <span>Çok yakında burada.</span>
          </p>
          <p className="privacy-note">
            Giriş yaparak <a href="#terms">Kullanım Koşulları</a> ve{' '}
            <a href="#privacy">Gizlilik Politikası</a>'nı kabul etmiş olursun.
          </p>
        </div>

        <div className="form-footer">
          <span>© 2026 Liva</span>
          <span>Senin için, özenle.</span>
        </div>
      </section>
    </main>
  )
}

function HomePage({
  email,
  message,
  token,
  isAdmin,
  onLogout,
}: {
  email: string
  message: string
  token: string
  isAdmin: boolean
  onLogout: () => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

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

  if ((isCreatingProduct || editingProduct !== null) && isAdmin) {
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
      <section className="store-welcome">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          LIVA DÜNYASINA HOŞ GELDİN
        </span>
        <h1>{message}<span>.</span></h1>
        <p>{email} olarak giriş yaptın. Sana iyi gelecek şeyler burada başlıyor.</p>
      </section>
      <section aria-labelledby="products-heading" className="products-section">
        <div className="products-heading-row">
          <div>
            <span className="products-kicker">LIVA SEÇKİSİ</span>
            <h2 id="products-heading">Sana iyi gelecek ürünler</h2>
          </div>
          {!isLoading && !error && (
            <span className="products-count">{products.length} ürün</span>
          )}
          {isAdmin && (
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
                  {isAdmin && <th scope="col">İşlem</th>}
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
                    {isAdmin && (
                      <td>
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
  } | null>(null)

  async function handleLogin(email: string, password: string) {
    const tokenResponse = await login(email, password)
    let homeResponse
    try {
      homeResponse = await getHome(tokenResponse.access_token)
    } catch (error) {
      throw new HomeLoadError(error)
    }
    setHome({
      email,
      message: homeResponse.message,
      token: tokenResponse.access_token,
      isAdmin: tokenResponse.is_admin,
    })
  }

  if (home) {
    return (
      <HomePage
        email={home.email}
        isAdmin={home.isAdmin}
        message={home.message}
        onLogout={() => setHome(null)}
        token={home.token}
      />
    )
  }

  return <LoginPage onLogin={handleLogin} />
}

export default App
