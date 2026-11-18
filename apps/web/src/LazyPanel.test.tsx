import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LazyPanel from './LazyPanel'

describe('LazyPanel', () => {
  it('announces when a lazy panel fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const FailedPanel = lazy(() => Promise.reject(new Error('chunk load failed')))

    render(
      <LazyPanel>
        <FailedPanel />
      </LazyPanel>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İçerik yüklenemedi. Sayfayı yenileyip tekrar dene.',
    )
  })
})
