import { render, screen } from '@/test/render'
import { describe, expect, it } from '@/test/bun'
import NotFound from './not-found'

describe('NotFound page', () => {
  it('renders 404 message and Back to Heliobond link with primary button tokens (#709)', async () => {
    render(await NotFound())
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Back to Heliobond' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
    expect(link.style.background).toContain('var(--button-primary-bg)')
    expect(link.style.color).toContain('var(--button-primary-fg)')
  })
})
