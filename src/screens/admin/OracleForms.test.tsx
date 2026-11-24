import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/test/render'
import { describe, it, expect, vi } from 'vitest'
import { OracleForms } from './OracleForms'
import { type RegistryEntry } from '@/data/admin'

const mockProjects: RegistryEntry[] = [
  {
    id: 1,
    name: 'Solar Alpha',
    type: 'Solar',
    location: 'Kenya',
    credit: 85,
    green: 72,
    funded: '$100,000',
    fundedAmount: 100000,
    fundingGoal: 200000,
    lastVerified: '2 days ago',
    priceHistory: [],
  },
]

const noop = async () => true

vi.mock('@/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components')>()
  return {
    ...actual,
    Button: ({
      children,
      disabled,
      onClick,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onClick?: () => void
    }) => (
      <button disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
  }
})

describe('OracleForms validation', () => {
  it('disables score submission when both fields are empty', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('enables score submission for valid scores (0-100)', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '75' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).not.toBeDisabled()
  })

  it('disables score submission when credit is out of range (>100)', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '150' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('disables score submission when green is negative', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '-5' } })
    const submitBtn = screen.getByText('Update on-chain scores')
    expect(submitBtn).toBeDisabled()
  })

  it('clamps scores to 0-100 on submission', () => {
    const onPushScores = vi.fn().mockResolvedValue(true)
    render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={noop}
      />,
    )
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '50' } })
    fireEvent.change(inputs[1], { target: { value: '80' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    expect(onPushScores).toHaveBeenCalledWith(1, 50, 80)
  })

  it('disables fund submission when amount is zero', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).toBeDisabled()
  })

  it('disables fund submission when amount exceeds liquid', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '60000' } })
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).toBeDisabled()
  })

  it('enables fund submission when amount is within liquid balance', () => {
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={noop} />,
    )
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '30000' } })
    const submitBtn = screen.getByText('Fund from the vault')
    expect(submitBtn).not.toBeDisabled()
  })

  it('calls onFund with correct values on valid submission', () => {
    const onFund = vi.fn().mockResolvedValue(true)
    render(
      <OracleForms projects={mockProjects} liquid={50_000} onPushScores={noop} onFund={onFund} />,
    )
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '25000' } })
    fireEvent.click(screen.getByText('Fund from the vault'))
    expect(onFund).toHaveBeenCalledWith(1, 25000)
  })

  describe('Issue #694: Funding guardrails', () => {
    it('disables fund submission and shows warning when registry is paused', () => {
      render(
        <OracleForms
          projects={mockProjects}
          liquid={50_000}
          guardrails={{ isRegistryPaused: true }}
          onPushScores={noop}
          onFund={noop}
        />,
      )
      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '10000' } })
      const submitBtn = screen.getByText('Fund from the vault')
      expect(submitBtn).toBeDisabled()
      expect(
        screen.getByText('Registry is currently paused. Project funding is disabled.'),
      ).toBeInTheDocument()
    })

    it('enforces insurance reserve deducting from liquid deployable balance', () => {
      render(
        <OracleForms
          projects={mockProjects}
          liquid={50_000}
          guardrails={{ insuranceReserve: 20_000 }} // deployable is 30,000
          onPushScores={noop}
          onFund={noop}
        />,
      )
      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '35000' } })
      const submitBtn = screen.getByText('Fund from the vault')
      expect(submitBtn).toBeDisabled()
      expect(
        screen.getByText(/Amount exceeds deployable balance after insurance reserve of \$20,000/),
      ).toBeInTheDocument()

      fireEvent.change(amountInput, { target: { value: '25000' } })
      expect(submitBtn).not.toBeDisabled()
    })

    it('enforces per-project investment capacity cap', () => {
      render(
        <OracleForms
          projects={mockProjects}
          liquid={50_000}
          guardrails={{ investmentCapacities: { 1: 15_000 } }}
          onPushScores={noop}
          onFund={noop}
        />,
      )
      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '20000' } })
      const submitBtn = screen.getByText('Fund from the vault')
      expect(submitBtn).toBeDisabled()
      expect(
        screen.getByText(/Amount exceeds remaining capacity for this project \(\$15,000\)/),
      ).toBeInTheDocument()

      fireEvent.change(amountInput, { target: { value: '12000' } })
      expect(submitBtn).not.toBeDisabled()
    })
  })
})

describe('Issue #1007: selected IDs follow the current rows', () => {
  const liveProjects: RegistryEntry[] = [
    { ...mockProjects[0], id: 101, name: 'Live Solar', credit: 70, green: 60 },
    { ...mockProjects[0], id: 202, name: 'Live Wind', type: 'Wind', credit: 55, green: 65 },
  ]

  it('selects an actual current project after the fixture list is replaced', () => {
    const onPushScores = vi.fn().mockResolvedValue(true)
    const onFund = vi.fn().mockResolvedValue(true)
    const { rerender } = render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={onFund}
      />,
    )

    rerender(
      <OracleForms
        projects={liveProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={onFund}
      />,
    )

    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toHaveValue('101')
    expect(selects[1]).toHaveValue('101')

    const scoreInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(scoreInputs[0], { target: { value: '40' } })
    fireEvent.change(scoreInputs[1], { target: { value: '50' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    expect(onPushScores).toHaveBeenCalledWith(101, 40, 50)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByText('Fund from the vault'))
    expect(onFund).toHaveBeenCalledWith(101, 1000)
  })

  it('invokes neither handler when there are no projects to act on', () => {
    const onPushScores = vi.fn().mockResolvedValue(true)
    const onFund = vi.fn().mockResolvedValue(true)
    render(
      <OracleForms projects={[]} liquid={50_000} onPushScores={onPushScores} onFund={onFund} />,
    )

    const scoreInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(scoreInputs[0], { target: { value: '40' } })
    fireEvent.change(scoreInputs[1], { target: { value: '50' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })

    expect(screen.getByText('Update on-chain scores')).toBeDisabled()
    expect(screen.getByText('Fund from the vault')).toBeDisabled()
    fireEvent.click(screen.getByText('Update on-chain scores'))
    fireEvent.click(screen.getByText('Fund from the vault'))

    expect(onPushScores).not.toHaveBeenCalled()
    expect(onFund).not.toHaveBeenCalled()
  })
})

describe('Issue #1008: preserve drafts during asynchronous submission', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  it('does not clear newly edited scores after an earlier request succeeds', async () => {
    const request = deferred<boolean>()
    const onPushScores = vi.fn(() => request.promise)
    render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={noop}
      />,
    )

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '40' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    fireEvent.change(inputs[0], { target: { value: '60' } })
    fireEvent.change(inputs[1], { target: { value: '70' } })

    request.resolve(true)

    await waitFor(() => {
      expect(inputs[0]).toHaveValue(60)
      expect(inputs[1]).toHaveValue(70)
    })
  })

  it('does not clear a newly edited amount after an earlier request succeeds', async () => {
    const request = deferred<boolean>()
    const onFund = vi.fn(() => request.promise)
    render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={noop}
        onFund={onFund}
      />,
    )

    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '1000' } })
    fireEvent.click(screen.getByText('Fund from the vault'))
    fireEvent.change(amountInput, { target: { value: '2000' } })

    request.resolve(true)

    await waitFor(() => expect(amountInput).toHaveValue('2000'))
  })

  it('clears an unchanged draft after a successful request', async () => {
    const request = deferred<boolean>()
    const onPushScores = vi.fn(() => request.promise)
    render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={noop}
      />,
    )

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '40' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    request.resolve(true)

    await waitFor(() => {
      expect(inputs[0]).toHaveValue(null)
      expect(inputs[1]).toHaveValue(null)
    })
  })

  it('preserves score and amount drafts when submission fails', async () => {
    const scoreRequest = deferred<boolean>()
    const fundRequest = deferred<boolean>()
    const onPushScores = vi.fn(() => scoreRequest.promise)
    const onFund = vi.fn(() => fundRequest.promise)
    render(
      <OracleForms
        projects={mockProjects}
        liquid={50_000}
        onPushScores={onPushScores}
        onFund={onFund}
      />,
    )

    const scoreInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(scoreInputs[0], { target: { value: '40' } })
    fireEvent.change(scoreInputs[1], { target: { value: '50' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByText('Update on-chain scores'))
    fireEvent.click(screen.getByText('Fund from the vault'))
    scoreRequest.resolve(false)
    fundRequest.resolve(false)

    await waitFor(() => {
      expect(scoreInputs[0]).toHaveValue(40)
      expect(scoreInputs[1]).toHaveValue(50)
      expect(screen.getByPlaceholderText('0.00')).toHaveValue('1000')
    })
  })
})
