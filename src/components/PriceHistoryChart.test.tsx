import { describe, expect, it } from '@/test/bun'
import { render, screen } from '../test/render'
import PriceHistoryChart from './PriceHistoryChart'
import { selectPriceHistory } from '../state/selectors'

describe('PriceHistoryChart', () => {
  it('renders price and yield series for a project with history', () => {
    render(<PriceHistoryChart projectId={1} />)
    expect(screen.getByLabelText('Bond price history')).toBeInTheDocument()
    expect(screen.getByLabelText('Price history trend')).toBeInTheDocument()
    expect(screen.getByLabelText('Yield history trend')).toBeInTheDocument()
  })

  it('reflects the latest observation from the flat selector', () => {
    render(<PriceHistoryChart projectId={1} />)
    const history = selectPriceHistory(1)
    const last = history[history.length - 1]
    expect(screen.getByText(`${last.yield.toFixed(2)}%`)).toBeInTheDocument()
  })

  it('renders nothing for an unknown project (safe empty state)', () => {
    render(<PriceHistoryChart projectId={9999} />)
    expect(screen.queryByLabelText('Bond price history')).not.toBeInTheDocument()
  })

  it('renders the supplied observations for a project outside the fixture store', () => {
    const priceHistory = [
      { date: '2025-01-01', price: 99.1, yield: 6, hash: 'first' },
      { date: '2025-02-01', price: 99.35, yield: 6.25, hash: 'last' },
    ]
    render(<PriceHistoryChart projectId={9999} priceHistory={priceHistory} />)
    expect(screen.getByText('99.35% of par')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.25 since/)).toBeInTheDocument()
  })

  it('does not fall back to demo prices when a live history is empty', () => {
    render(<PriceHistoryChart projectId={1} priceHistory={[]} />)
    expect(screen.queryByLabelText('Bond price history')).not.toBeInTheDocument()
  })
})
