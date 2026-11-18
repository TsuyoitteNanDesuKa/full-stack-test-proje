import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'

export default class LazyPanel extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="products-error" role="alert">
          İçerik yüklenemedi. Sayfayı yenileyip tekrar dene.
        </p>
      )
    }

    return (
      <Suspense fallback={<p className="products-status" role="status">İçerik yükleniyor...</p>}>
        {this.props.children}
      </Suspense>
    )
  }
}
