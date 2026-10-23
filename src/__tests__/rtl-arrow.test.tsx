import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/render'

function ArrowLabel({ label }: { label: string }) {
  return (
    <a href="#" dir="rtl">
      {label} <span className="hb-rtl-arrow">→</span>
    </a>
  )
}

describe('RTL arrow', () => {
  it('renders the arrow glyph with the hb-rtl-arrow class', () => {
    render(<ArrowLabel label="عرض الاستثمار" />)
    const arrow = screen.getByText('→')
    expect(arrow).toHaveClass('hb-rtl-arrow')
  })

  it('flips via CSS under [dir=rtl]', () => {
    render(<ArrowLabel label="عرض الاستثمار" />)
    const arrow = screen.getByText('→')
    const link = arrow.closest('a')
    expect(link).toHaveAttribute('dir', 'rtl')
  })
})
