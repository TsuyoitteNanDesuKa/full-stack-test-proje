import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  addCartItem,
  createOrder,
  deleteCartItem,
  deleteProduct,
  getCurrentUser,
  getHome,
  getMyCart,
  getMyAddresses,
  getProducts,
  updateCartItem,
} from './api'
import type {
  CartResponse,
  CustomerAddress,
  CustomerOrder,
  DeliveryMethod,
  Product,
  ProductSearchParams,
} from './api'
import { beginLogin, beginRegistration, endSession, getCurrentSession } from './auth'
import AdminOrdersPanel from './AdminOrdersPanel'
import AdminSellerApplicationsPanel from './AdminSellerApplicationsPanel'
import CartPanel from './CartPanel'
import AddressBookPanel from './AddressBookPanel'
import OrderHistoryPanel from './OrderHistoryPanel'
import ProductCreatePage from './ProductCreatePage'
import SellerApplicationPanel from './SellerApplicationPanel'
import SellerOrdersPanel from './SellerOrdersPanel'

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
  const [productSearch, setProductSearch] = useState('')
  const [productCategory, setProductCategory] = useState('')
  const [productMinPrice, setProductMinPrice] = useState('')
  const [productMaxPrice, setProductMaxPrice] = useState('')
  const [productSort, setProductSort] = useState<ProductSearchParams['sort']>('id')
  const [appliedProductFilters, setAppliedProductFilters] = useState<ProductSearchParams>({})
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [showSellerApplications, setShowSellerApplications] = useState(false)
  const [cart, setCart] = useState<CartResponse | null>(null)
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [isAddressLoading, setIsAddressLoading] = useState(true)
  const [addressLoadError, setAddressLoadError] = useState('')
  const [addressRetryCount, setAddressRetryCount] = useState(0)
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard')
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false)
  const [isCartLoading, setIsCartLoading] = useState(true)
  const [cartLoadError, setCartLoadError] = useState('')
  const [cartRetryCount, setCartRetryCount] = useState(0)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCartMutating, setIsCartMutating] = useState(false)
  const [cartError, setCartError] = useState('')
  const [addingProductId, setAddingProductId] = useState<number | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [latestOrder, setLatestOrder] = useState<CustomerOrder | null>(null)
  const [orderHistoryRefreshVersion, setOrderHistoryRefreshVersion] = useState(0)
  const checkoutIdempotencyKey = useRef<string | null>(null)
  const canCreateProducts = isAdmin || roles.includes('seller')
  const isBuyer = roles.includes('buyer')

  function applyProductFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      productMinPrice &&
      productMaxPrice &&
      Number(productMinPrice) > Number(productMaxPrice)
    ) {
      setError('Minimum fiyat maksimum fiyattan büyük olamaz.')
      return
    }
    setError('')
    setIsLoading(true)
    setAppliedProductFilters({
      search: productSearch.trim(),
      category: productCategory.trim(),
      min_price: productMinPrice,
      max_price: productMaxPrice,
      sort: productSort === 'id' ? undefined : productSort,
    })
  }

  useEffect(() => {
    let active = true
    getProducts(token, 20, 0, appliedProductFilters)
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
  }, [appliedProductFilters, retryCount, token])

  useEffect(() => {
    if (!isBuyer) {
      return
    }

    let active = true
    getMyCart(token)
      .then((response) => {
        if (active) {
          setCart(response)
        }
      })
      .catch(() => {
        if (active) {
          setCartLoadError('Sepet yüklenemedi. Lütfen bağlantını kontrol edip tekrar dene.')
        }
      })
      .finally(() => {
        if (active) {
          setIsCartLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [cartRetryCount, isBuyer, token])

  useEffect(() => {
    if (!isBuyer) {
      return
    }

    let active = true
    getMyAddresses(token)
      .then((loadedAddresses) => {
        if (active) {
          setAddresses(loadedAddresses)
          setAddressLoadError('')
          setSelectedAddressId((current) =>
            current !== null && loadedAddresses.some((address) => address.id === current)
              ? current
              : loadedAddresses.find((address) => address.is_default)?.id ??
                loadedAddresses[0]?.id ??
                null,
          )
        }
      })
      .catch(() => {
        if (active) {
          setAddressLoadError('Adresler yüklenemedi. Lütfen bağlantını kontrol edip tekrar dene.')
        }
      })
      .finally(() => {
        if (active) {
          setIsAddressLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [addressRetryCount, isBuyer, token])

  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })

  function getCartErrorMessage(error: unknown): string {
    if (error instanceof TypeError) {
      return 'Sunucuya bağlanılamadı. Sepet işlemi tamamlanamadı.'
    }
    if (error instanceof Error && 'status' in error && error.status === 409) {
      return 'İstenen miktar mevcut stoktan fazla. Sepetini ve ürün stoğunu kontrol et.'
    }
    if (error instanceof Error && 'status' in error && error.status === 404) {
      return 'Ürün veya sepet satırı artık mevcut değil. Sepetini yenile.'
    }
    if (error instanceof Error && 'status' in error && error.status === 401) {
      return 'Oturum süren dolmuş. Yeniden giriş yapıp tekrar dene.'
    }
    return 'Sepet işlemi tamamlanamadı. Lütfen tekrar dene.'
  }

  async function handleAddToCart(product: Product) {
    setAddingProductId(product.id)
    setCartError('')
    try {
      const updatedCart = await addCartItem(token, { product_id: product.id, quantity: 1 })
      setCart(updatedCart)
      setCartLoadError('')
      setIsCartOpen(true)
    } catch (error) {
      setCartError(getCartErrorMessage(error))
      setIsCartOpen(true)
    } finally {
      setAddingProductId(null)
    }
  }

  async function handleCartUpdate(itemId: number, quantity: number) {
    setIsCartMutating(true)
    setCartError('')
    try {
      setCart(await updateCartItem(token, itemId, { quantity }))
    } catch (error) {
      setCartError(getCartErrorMessage(error))
    } finally {
      setIsCartMutating(false)
    }
  }

  async function handleCartRemove(itemId: number) {
    setIsCartMutating(true)
    setCartError('')
    try {
      await deleteCartItem(token, itemId)
      setCart(await getMyCart(token))
    } catch (error) {
      setCartError(getCartErrorMessage(error))
    } finally {
      setIsCartMutating(false)
    }
  }

  async function handleCheckout() {
    if (selectedAddressId === null) {
      setCartError('Sipariş oluşturmak için önce bir teslimat adresi ekle veya seç.')
      return
    }
    setIsCheckingOut(true)
    setCartError('')
    checkoutIdempotencyKey.current ??= globalThis.crypto.randomUUID()
    try {
      const order = await createOrder(token, checkoutIdempotencyKey.current, {
        address_id: selectedAddressId,
        delivery_method: deliveryMethod,
      })
      checkoutIdempotencyKey.current = null
      setLatestOrder(order)
      setCart({ items: [], subtotal: '0.00' })
      setOrderHistoryRefreshVersion((version) => version + 1)
    } catch (error) {
      if (error instanceof TypeError) {
        setCartError('Sunucuya bağlanılamadı. Aynı istekle tekrar deneyebilirsin.')
      } else if (error instanceof Error && 'status' in error && error.status === 409) {
        setCartError('Sepetindeki ürün veya stok değişti. Sepetini kontrol edip tekrar dene.')
        try {
          setCart(await getMyCart(token))
        } catch (refreshError) {
          setCartError(
            `Sepetindeki ürün veya stok değişti. ${getCartErrorMessage(refreshError)}`,
          )
        }
      } else if (error instanceof Error && 'status' in error && error.status === 401) {
        setCartError('Oturum süren dolmuş. Yeniden giriş yapıp tekrar dene.')
      } else if (error instanceof Error && 'status' in error && error.status === 404) {
        setCartError('Teslimat adresin bulunamadı. Adreslerini yenileyip tekrar seç.')
        setAddressRetryCount((count) => count + 1)
      } else {
        setCartError('Sipariş oluşturulamadı. Lütfen aynı isteği tekrar dene.')
      }
    } finally {
      setIsCheckingOut(false)
    }
  }

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
      setRetryCount((count) => count + 1)
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
        onSaved={(_product) => {
          setRetryCount((count) => count + 1)
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
      {isBuyer && (
        <>
          <div className="customer-address-toolbar">
            <button
              aria-expanded={isAddressBookOpen}
              className="retry-button"
              onClick={() => setIsAddressBookOpen((open) => !open)}
              type="button"
            >
              {isAddressBookOpen ? 'Adres defterini kapat' : 'Adreslerim'}
            </button>
          </div>
          {isAddressBookOpen && (
            <AddressBookPanel
              addresses={addresses}
              isLoading={isAddressLoading}
              loadError={addressLoadError}
              onRetry={() => {
                setIsAddressLoading(true)
                setAddressLoadError('')
                setAddressRetryCount((count) => count + 1)
              }}
              onSaved={() => {
                setIsAddressLoading(true)
                setAddressRetryCount((count) => count + 1)
              }}
              token={token}
            />
          )}
          <CartPanel
            addresses={addresses}
            cart={cart}
            error={cartError || cartLoadError}
            deliveryMethod={deliveryMethod}
            isCheckingOut={isCheckingOut}
            isAddressLoading={isAddressLoading}
            isLoading={isCartLoading}
            isMutating={isCartMutating}
            isOpen={isCartOpen}
            onCheckout={handleCheckout}
            onManageAddresses={() => setIsAddressBookOpen(true)}
            onRemove={handleCartRemove}
            onRetry={() => {
              setIsCartLoading(true)
              setCartLoadError('')
              setCartRetryCount((count) => count + 1)
            }}
            onToggle={() => setIsCartOpen((open) => !open)}
            onUpdate={handleCartUpdate}
            onSelectAddress={setSelectedAddressId}
            onSelectDeliveryMethod={setDeliveryMethod}
            selectedAddressId={selectedAddressId}
          />
          <OrderHistoryPanel
            latestOrder={latestOrder}
            refreshVersion={orderHistoryRefreshVersion}
            token={token}
          />
        </>
      )}
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
        <>
          <button
            className="retry-button"
            onClick={() => setShowSellerApplications(true)}
            type="button"
          >
            Satıcı başvurularını yönet
          </button>
          <AdminOrdersPanel token={token} />
        </>
      ) : (
        <>
          <SellerApplicationPanel token={token} />
          {roles.includes('seller') && <SellerOrdersPanel token={token} />}
        </>
      )}
      <section aria-labelledby="products-heading" className="products-section">
        <div className="products-heading-row">
          <div>
            <span className="products-kicker">LIVA SEÇKİSİ</span>
            <h2 id="products-heading">Sana iyi gelecek ürünler</h2>
          </div>
          {!isLoading && !error && (
            <span className="products-count">{products.length} ürün gösteriliyor</span>
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
        <form className="product-search-form" onSubmit={applyProductFilters}>
          <label>
            Ürün ara
            <input
              onChange={(event) => setProductSearch(event.target.value)}
              type="search"
              value={productSearch}
            />
          </label>
          <label>
            Kategori
            <input
              onChange={(event) => setProductCategory(event.target.value)}
              type="text"
              value={productCategory}
            />
          </label>
          <label>
            En düşük fiyat
            <input
              min="0"
              onChange={(event) => setProductMinPrice(event.target.value)}
              step="0.01"
              type="number"
              value={productMinPrice}
            />
          </label>
          <label>
            En yüksek fiyat
            <input
              min="0"
              onChange={(event) => setProductMaxPrice(event.target.value)}
              step="0.01"
              type="number"
              value={productMaxPrice}
            />
          </label>
          <label>
            Sırala
            <select
              onChange={(event) =>
                setProductSort(event.target.value as ProductSearchParams['sort'])
              }
              value={productSort}
            >
              <option value="id">Varsayılan</option>
              <option value="name">Ürün adına göre</option>
              <option value="price_asc">Fiyat: artan</option>
              <option value="price_desc">Fiyat: azalan</option>
            </select>
          </label>
          <button className="retry-button" type="submit">Filtrele</button>
        </form>
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
            {appliedProductFilters.search ||
            appliedProductFilters.category ||
            appliedProductFilters.min_price ||
            appliedProductFilters.max_price ? (
              <>
                <p>Bu filtrelerle ürün bulunamadı.</p>
                <small>Arama veya filtrelerini değiştirip tekrar deneyebilirsin.</small>
              </>
            ) : (
              <>
                <p>Henüz listelenecek ürün yok.</p>
                <small>Yeni ürünler eklendiğinde burada görebilirsin.</small>
              </>
            )}
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
                  {isBuyer && <th scope="col">Sepet</th>}
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
                    {isBuyer && (
                      <td>
                        <button
                          aria-label={`Sepete ekle ${product.name}`}
                          className="add-cart-item-button"
                          disabled={product.stock < 1 || addingProductId === product.id}
                          onClick={() => void handleAddToCart(product)}
                          type="button"
                        >
                          {addingProductId === product.id
                            ? 'Ekleniyor...'
                            : product.stock < 1
                              ? 'Stokta yok'
                              : 'Sepete ekle'}
                        </button>
                      </td>
                    )}
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
