import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/render'
import { Landing } from './Landing'

describe('Landing Screen (Issue #717)', () => {
  it('renders hero and includes static Helio orb for SSR without layout shift', () => {
    const handleConnect = vi.fn()
    const handleExplore = vi.fn()

    const { container } = render(<Landing onConnect={handleConnect} onExplore={handleExplore} />)

    // Verify hero section is present
    expect(screen.getByRole('main')).toBeInTheDocument()

    // Verify .hb-hero-helio exists and contains an SVG Helio orb immediately
    const heroHelio = container.querySelector('.hb-hero-helio')
    expect(heroHelio).toBeInTheDocument()
    const svg = heroHelio?.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
