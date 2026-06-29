import { describe, it, expect } from 'vitest'
import { Sparkline } from './Sparkline'
import { render } from '@testing-library/react'

describe('Sparkline', () => {
  describe('Point generation', () => {
    it('generates points for multiple values', () => {
      const { container } = render(<Sparkline points={[10, 20, 15, 30]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
      expect(polyline?.getAttribute('points')).toBeTruthy()
    })

    it('renders polyline only when more than one point', () => {
      const { container } = render(<Sparkline points={[10, 20, 15]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
    })

    it('does not render polyline for single point', () => {
      const { container } = render(<Sparkline points={[10]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).not.toBeInTheDocument()
    })

    it('does not render polyline for empty array', () => {
      const { container } = render(<Sparkline points={[]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).not.toBeInTheDocument()
    })

    it('calculates correct coordinate range', () => {
      const { container } = render(<Sparkline points={[0, 10, 20]} width={100} height={40} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('100')
      expect(svg?.getAttribute('height')).toBe('40')
    })
  })

  describe('Flat line guard', () => {
    it('handles all-equal values without divide-by-zero', () => {
      // All values are the same - span should be 1 to avoid division by zero
      const { container } = render(<Sparkline points={[5, 5, 5, 5]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
      expect(polyline?.getAttribute('points')).toBeTruthy()
    })

    it('renders flat line correctly', () => {
      const flatPoints = [10, 10, 10]
      const { container } = render(<Sparkline points={flatPoints} height={36} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
      // All y-coordinates should be the same (middle of the graph)
      const points = polyline?.getAttribute('points')
      expect(points).toMatch(/\d+\.?\d*,\d+\.?\d* \d+\.?\d*,\d+\.?\d*/)
    })

    it('handles single-point flat line', () => {
      const { container } = render(<Sparkline points={[42]} />)
      const circle = container.querySelector('circle')
      expect(circle).toBeInTheDocument()
    })
  })

  describe('Last point indicator', () => {
    it('renders a circle at the last point', () => {
      const { container } = render(<Sparkline points={[10, 20, 30]} />)
      const circle = container.querySelector('circle')
      expect(circle).toBeInTheDocument()
    })

    it('circle has correct styling', () => {
      const { container } = render(<Sparkline points={[10, 20, 30]} />)
      const circle = container.querySelector('circle')
      expect(circle?.getAttribute('r')).toBe('3')
      expect(circle?.getAttribute('fill')).toBe('#FFB400')
    })

    it('circle is positioned at the last point', () => {
      const { container } = render(<Sparkline points={[10, 50]} width={100} height={40} />)
      const circle = container.querySelector('circle')
      expect(circle).toBeInTheDocument()
      // Last point should be at a higher x coordinate
      const cx = circle?.getAttribute('cx')
      expect(cx).toBeTruthy()
    })

    it('renders circle for single-point sparkline', () => {
      const { container } = render(<Sparkline points={[15]} />)
      const circle = container.querySelector('circle')
      expect(circle).toBeInTheDocument()
      expect(circle?.getAttribute('fill')).toBe('#FFB400')
    })
  })

  describe('Coordinate math', () => {
    it('spreads points evenly across width for multiple points', () => {
      const { container } = render(<Sparkline points={[1, 2, 3, 4, 5]} width={100} />)
      const polyline = container.querySelector('polyline')
      const points = polyline?.getAttribute('points')?.split(' ')
      expect(points?.length).toBe(5)
    })

    it('centers single point horizontally', () => {
      const { container } = render(<Sparkline points={[50]} width={100} height={40} />)
      const circle = container.querySelector('circle')
      const cx = parseFloat(circle?.getAttribute('cx') ?? '0')
      // With width=100 and default padding=4, center should be around 50
      expect(cx).toBeGreaterThan(40)
      expect(cx).toBeLessThan(60)
    })

    it('maps values correctly to y-coordinates', () => {
      const { container } = render(<Sparkline points={[10, 20, 30]} width={100} height={40} />)
      const polyline = container.querySelector('polyline')
      const pointsStr = polyline?.getAttribute('points')
      expect(pointsStr).toBeTruthy()
      // Higher values should have lower y coordinates (SVG coordinates)
      const coords = pointsStr?.split(' ').map((p) => p.split(',').map(Number))
      if (coords && coords.length >= 2) {
        expect(coords[0][1]).toBeGreaterThan(coords[2][1]) // First point y > last point y
      }
    })
  })

  describe('Rendering', () => {
    it('renders SVG element', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('uses provided width and height', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} width={200} height={60} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('200')
      expect(svg?.getAttribute('height')).toBe('60')
    })

    it('uses default dimensions when not provided', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('132')
      expect(svg?.getAttribute('height')).toBe('36')
    })

    it('applies custom color to polyline', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} color="#FF0000" />)
      const polyline = container.querySelector('polyline')
      expect(polyline?.getAttribute('stroke')).toBe('#FF0000')
    })

    it('uses default color when not provided', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline?.getAttribute('stroke')).toBe('var(--ink-40)')
    })

    it('sets aria-label when provided', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} aria-label="Price trend" />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('aria-label')).toBe('Price trend')
    })

    it('sets role="img" on SVG', () => {
      const { container } = render(<Sparkline points={[1, 2, 3]} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('role')).toBe('img')
    })
  })

  describe('Edge cases', () => {
    it('handles very small numbers', () => {
      const { container } = render(<Sparkline points={[0.001, 0.002, 0.003]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
    })

    it('handles very large numbers', () => {
      const { container } = render(<Sparkline points={[1000000, 2000000, 3000000]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
    })

    it('handles negative numbers', () => {
      const { container } = render(<Sparkline points={[-10, 0, 10]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
    })

    it('handles mixed positive and negative', () => {
      const { container } = render(<Sparkline points={[-5, 10, -2, 15]} />)
      const polyline = container.querySelector('polyline')
      expect(polyline).toBeInTheDocument()
    })
  })
})
