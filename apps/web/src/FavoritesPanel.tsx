import { useEffect, useState } from 'react'
import { getFavorites, removeFavorite } from './api'
import type { FavoritePage } from './api'

const pageSize = 20

export default function FavoritesPanel({
  token,
  onOpenProduct,
}: {
  token: string
  onOpenProduct: (id: number) => void
}) {
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<FavoritePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    getFavorites(token, pageSize, offset)
      .then((result) => {
        if (!active) return
        if (result.items.length === 0 && offset > 0) {
          setOffset(Math.max(0, offset - pageSize))
          return
        }
        setPage(result)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPage(null)
        setError('Favoriler yüklenemedi. Lütfen tekrar dene.')
        setLoading(false)
      })
    return () => { active = false }
  }, [token, offset, refresh])

  function reload() {
    setError('')
    setLoading(true)
    setRefresh((value) => value + 1)
  }

  function changePage(next: number) {
    setError('')
    setLoading(true)
    setOffset(next)
  }

  async function handleRemove(id: number) {
    setRemovingId(id)
    setError('')
    try {
      await removeFavorite(token, id)
      reload()
    } catch {
      setError('Ürün favorilerden çıkarılamadı. Lütfen tekrar dene.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section aria-label="Favorilerim">
      <h2>Favorilerim</h2>
      {loading && <p role="status">Favoriler yükleniyor...</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="retry-button" onClick={reload} type="button">Tekrar dene</button>
        </div>
      )}
      {!loading && page && (
        <>
          {page.items.length === 0 ? <p>Henüz favori ürünün yok.</p> : (
            <ul>
              {page.items.map((product) => (
                <li key={product.id}>
                  <button className="link-button" onClick={() => onOpenProduct(product.id)} type="button">
                    {product.name}
                  </button>
                  {' '}
                  <button
                    className="retry-button"
                    disabled={removingId !== null}
                    onClick={() => void handleRemove(product.id)}
                    type="button"
                  >
                    {removingId === product.id ? 'Çıkarılıyor...' : `${product.name} favorilerden çıkar`}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="retry-button" disabled={offset === 0} onClick={() => changePage(offset - pageSize)} type="button">
            Önceki sayfa
          </button>
          <button className="retry-button" disabled={!page.has_more} onClick={() => changePage(offset + pageSize)} type="button">
            Sonraki sayfa
          </button>
        </>
      )}
    </section>
  )
}
