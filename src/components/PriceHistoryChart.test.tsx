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
})
