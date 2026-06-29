import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OracleForms } from './OracleForms'
import { type RegistryEntry } from '@/data/admin'

const mockProjects: RegistryEntry[] = [
  {
    id: 1,
    name: 'Solar Alpha',
    credit: 85,
    green: 72,
    funded: '$100,000',
    lastVerified: '2 days ago',
    apy: '8.2%',
    category: 'solar',
    description: 'Test project',
    risk: 'low',
    location: 'Kenya',
  },
]

vi.mock('@/components', () => ({
  Button: ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; reason?: string; size?: string; variant?: string }) => (
    <button disabled={disabled} onClick={onClick}>{children}</button>
  ),
}))

describe('OracleForms validation', () => {
  const noop = () => {}

  it('disables score submission when both fields are empty', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('enables score submission for valid scores (0-100)', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '75' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).not.toBeDisabled()
  })

  it('disables score submission when credit is out of range (>100)', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '150' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('disables score submission when green is negative', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '-5' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('clamps scores to 0-100 on submission', () => {
    const onPushScores = vi.fn()
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={onPushScores} onFund={noop} />)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '80' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    expect(onPushScores).toHaveBeenCalledWith(1, 50, 80)
  })

  it('disables fund submission when amount is zero', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).toBeDisabled()
  })

  it('disables fund submission when amount exceeds liquid', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '60000' } })
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).toBeDisabled()
  })

  it('enables fund submission when amount is within liquid balance', () => {
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />)
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '30000' } })
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).not.toBeDisabled()
  })

  it('calls onFund with correct values on valid submission', () => {
    const onFund = vi.fn()
    render(<OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={onFund} />)
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '25000' } })
    fireEvent.click(screen.getByText('Fund from the vault'))
    expect(onFund).toHaveBeenCalledWith(1, 25000)
  })
})
