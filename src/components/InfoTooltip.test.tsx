import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from '@/test/bun'
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

  it('describes the focused trigger with the tooltip content while open (#1075)', () => {
    render(<InfoTooltip label="About yield" content="Annual yield estimate." />)
    const button = screen.getByRole('button', { name: 'About yield' })
    expect(button).not.toHaveAttribute('aria-describedby')
    expect(button).not.toHaveAttribute('aria-controls')

    fireEvent.click(button)
    expect(button).toHaveAccessibleDescription('Annual yield estimate.')
    expect(button).toHaveAccessibleName('About yield')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('points each help control at its own content (#1075)', () => {
    render(
      <>
        <InfoTooltip label="About yield" content="Yield text." />
        <InfoTooltip label="About risk" content="Risk text." />
      </>,
    )
    const yieldButton = screen.getByRole('button', { name: 'About yield' })
    const riskButton = screen.getByRole('button', { name: 'About risk' })
    fireEvent.click(yieldButton)
    fireEvent.click(riskButton)
    expect(yieldButton).toHaveAccessibleDescription('Yield text.')
    expect(riskButton).toHaveAccessibleDescription('Risk text.')
    expect(yieldButton.getAttribute('aria-describedby')).not.toBe(
      riskButton.getAttribute('aria-describedby'),
    )
  })
})
