import { render, screen } from '@testing-library/react';
import PortfolioRiskScore from './PortfolioRiskScore';

const mixed = [
  { symbol: 'AAA25', rating: 'AAA' as const, weight: 30, yield: 4.5, maturity: '2028-06-15' },
  { symbol: 'BBB25', rating: 'BBB' as const, weight: 25, yield: 6.2, maturity: '2030-03-20' },
  { symbol: 'BB20', rating: 'BB' as const, weight: 20, yield: 8.1, maturity: '2032-11-10' },
  { symbol: 'B15', rating: 'B' as const, weight: 15, yield: 10.5, maturity: '2034-01-05' },
  { symbol: 'AA10', rating: 'AA' as const, weight: 10, yield: 5.1, maturity: '2029-09-30' },
];

describe('PortfolioRiskScore', () => {
  it('renders risk score for mixed portfolio', () => {
    render(<PortfolioRiskScore holdings={mixed} />);
    expect(screen.getByText('Portfolio Risk Score')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<PortfolioRiskScore holdings={[]} />);
    expect(screen.getByText(/No bond holdings/)).toBeInTheDocument();
  });

  it('renders all holdings', () => {
    render(<PortfolioRiskScore holdings={mixed} />);
    expect(screen.getByText('AAA25')).toBeInTheDocument();
    expect(screen.getByText('B15')).toBeInTheDocument();
  });

  it('all-AAA shows Very Low Risk', () => {
    render(<PortfolioRiskScore holdings={[
      { symbol: 'SAFE', rating: 'AAA' as const, weight: 100, yield: 4, maturity: '2028-01-01' }
    ]} />);
    expect(screen.getByText(/Very Low Risk/)).toBeInTheDocument();
  });
});
