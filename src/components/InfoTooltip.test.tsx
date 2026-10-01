import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InfoTooltip } from './InfoTooltip'

describe('InfoTooltip', () => {
  it('opens on tap/click and closes on a second click', () => {
    render(<InfoTooltip label="About yield" content="Annual yield estimate." />)
    const button = screen.getByRole('button', { name: 'About yield' })
    fireEvent.click(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Annual yield estimate.')
    fireEvent.click(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Escape and outside interaction', () => {
    render(
      <>
        <InfoTooltip label="About yield" content="Annual yield estimate." />
        <button type="button">Other control</button>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'About yield' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About yield' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Other control' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
