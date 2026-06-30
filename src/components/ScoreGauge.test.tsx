import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ScoreGauge } from './ScoreGauge'

describe('ScoreGauge arc geometry and clamping', () => {
  it('renders with default props', () => {
    render(<ScoreGauge />)
    const svg = screen.getByRole('img')
    expect(svg).toBeInTheDocument()
  })

  it('clamps fraction to 0 when value is negative', () => {
    const { container } = render(<ScoreGauge value={-50} max={100} />)
    const svg = container.querySelector('svg')
    const circles = svg!.querySelectorAll('circle')
    const valueCircle = circles[1]
    const dashArray = valueCircle.getAttribute('stroke-dasharray')
    expect(dashArray).toContain('0')
  })

  it('clamps fraction to 1 when value exceeds max', () => {
    const { container } = render(<ScoreGauge value={150} max={100} />)
    const svg = container.querySelector('svg')
    const circles = svg!.querySelectorAll('circle')
    const valueCircle = circles[1]
    const dashArray = valueCircle.getAttribute('stroke-dasharray')
    const r = 120 / 2 - 9 / 2 - 2
    const trackLen = 0.75 * 2 * Math.PI * r
    expect(dashArray).toContain(String(Math.round(trackLen)))
  })

  it('renders dot on arc for value 0', () => {
    const { container } = render(<ScoreGauge value={0} max={100} />)
    const svg = container.querySelector('svg')
    const circles = svg!.querySelectorAll('circle')
    const dotCircle = circles[2]
    expect(dotCircle).toBeInTheDocument()
    const cx = parseFloat(dotCircle.getAttribute('cx')!)
    const cy = parseFloat(dotCircle.getAttribute('cy')!)
    expect(cx).not.toBeNaN()
    expect(cy).not.toBeNaN()
  })

  it('renders dot on arc for max value', () => {
    const { container } = render(<ScoreGauge value={100} max={100} />)
    const svg = container.querySelector('svg')
    const circles = svg!.querySelectorAll('circle')
    const dotCircle = circles[2]
    expect(dotCircle).toBeInTheDocument()
    const cx = parseFloat(dotCircle.getAttribute('cx')!)
    const cy = parseFloat(dotCircle.getAttribute('cy')!)
    expect(cx).not.toBeNaN()
    expect(cy).not.toBeNaN()
  })

  it('renders dot on arc for out-of-range values', () => {
    const { container } = render(<ScoreGauge value={200} max={100} />)
    const svg = container.querySelector('svg')
    const circles = svg!.querySelectorAll('circle')
    const dotCircle = circles[2]
    expect(dotCircle).toBeInTheDocument()
    const cx = parseFloat(dotCircle.getAttribute('cx')!)
    const cy = parseFloat(dotCircle.getAttribute('cy')!)
    expect(cx).not.toBeNaN()
    expect(cy).not.toBeNaN()
  })

  it('displays correct value text', () => {
    render(<ScoreGauge value={42} max={100} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('applies custom size', () => {
    const { container } = render(<ScoreGauge value={50} max={100} size={200} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '200')
  })
})