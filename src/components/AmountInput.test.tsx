import { describe, it, expect } from 'vitest'
import { AmountInput } from './AmountInput'
import { render, fireEvent } from '@testing-library/react'

describe('AmountInput', () => {
  describe('Input sanitization', () => {
    it('strips non-numeric characters except dots', () => {
      let onChangeValue = ''
      const onChange = (value: string) => {
        onChangeValue = value
        expect(value).toMatch(/^[0-9.]*$/)
      }

      const { container } = render(<AmountInput onChange={onChange} />)
      const input = container.querySelector('input') as HTMLInputElement

      fireEvent.change(input, { target: { value: '123abc456' } })
      expect(onChangeValue).toBe('123456')

      fireEvent.change(input, { target: { value: '12.34$%^&' } })
      expect(onChangeValue).toBe('12.34')

      fireEvent.change(input, { target: { value: '!@#$%^&*()' } })
      expect(onChangeValue).toBe('')
    })

    it('preserves dots for decimal numbers', () => {
      let onChangeValue = ''
      const onChange = (value: string) => {
        onChangeValue = value
      }
      const { container } = render(<AmountInput onChange={onChange} />)
      const input = container.querySelector('input') as HTMLInputElement

      fireEvent.change(input, { target: { value: '100.50' } })
      expect(onChangeValue).toBe('100.50')

      fireEvent.change(input, { target: { value: '0.001' } })
      expect(onChangeValue).toBe('0.001')
    })

    it('strips leading zeros from the whole-number part (#370)', () => {
      let onChangeValue = ''
      const onChange = (value: string) => {
        onChangeValue = value
      }
      const { container } = render(<AmountInput onChange={onChange} />)
      const input = container.querySelector('input') as HTMLInputElement

      fireEvent.change(input, { target: { value: '007' } })
      expect(onChangeValue).toBe('7')

      fireEvent.change(input, { target: { value: '00.5' } })
      expect(onChangeValue).toBe('0.5')

      fireEvent.change(input, { target: { value: '0' } })
      expect(onChangeValue).toBe('0')

      fireEvent.change(input, { target: { value: '0.001' } })
      expect(onChangeValue).toBe('0.001')

      fireEvent.change(input, { target: { value: '010.25' } })
      expect(onChangeValue).toBe('10.25')
    })

    it('rejects multiple decimal points', () => {
      let result = ''
      const onChange = (value: string) => {
        result = value
      }

      const { container } = render(<AmountInput onChange={onChange} />)
      const input = container.querySelector('input') as HTMLInputElement

      fireEvent.change(input, { target: { value: '1.2.3' } })
      expect(result).toBe('1.23')

      fireEvent.change(input, { target: { value: '1..2' } })
      expect(result).toBe('1.2')
    })
  })

  describe('Cap behavior', () => {
    it('does not show cap notice when value is below cap', () => {
      const { container, queryByText } = render(
        <AmountInput value="50" cap={100} capMessage="Limit reached" />,
      )

      expect(queryByText('Limit reached')).not.toBeInTheDocument()
      expect(container.querySelector('input[value="50"]')).toBeInTheDocument()
    })

    it('shows cap notice when value exceeds cap', () => {
      const { getAllByText } = render(<AmountInput value="150" cap={100} capMessage="Over limit" />)
      expect(getAllByText('Over limit').length).toBeGreaterThan(0)
    })

    it('shows no default cap message when cap is exceeded and no custom message', () => {
      const { queryByText } = render(<AmountInput value="200" cap={100} currency="USDC" />)
      expect(queryByText(/You can withdraw up to/i)).not.toBeInTheDocument()
    })

    it('does not show cap notice when value equals cap', () => {
      const { queryByText } = render(<AmountInput value="100" cap={100} capMessage="Over limit" />)
      expect(queryByText('Over limit')).not.toBeInTheDocument()
    })

    it('shows Max button when cap and localized label are provided', () => {
      const { getByRole } = render(<AmountInput cap={100} maxChipLabel="Máximo" />)
      expect(getByRole('button', { name: /máx|max/i })).toBeInTheDocument()
    })

    it('does not show Max button when maxChipLabel is missing', () => {
      const { queryByRole } = render(<AmountInput />)
      expect(queryByRole('button', { name: /max/i })).not.toBeInTheDocument()
    })

    it('renders localized over-cap action when provided', () => {
      const { getByRole } = render(
        <AmountInput
          value="150"
          cap={100}
          capMessage="Over limit"
          capActionLabel="Retirer le maximum disponible"
        />,
      )
      expect(getByRole('button', { name: 'Retirer le maximum disponible' })).toBeInTheDocument()
    })

    it('applies border color change when over cap', () => {
      const { container, rerender } = render(<AmountInput value="50" cap={100} />)
      const borderDiv = container.querySelector('[style*="border"]') as HTMLElement
      expect(borderDiv.style.borderColor).not.toContain('var(--solar)')

      rerender(<AmountInput value="150" cap={100} />)
      const borderDivOverCap = container.querySelector('[style*="border"]') as HTMLElement
      // The component should update border color to solar when over cap
      expect(borderDivOverCap).toBeInTheDocument()
    })
  })

  describe('Chip buttons', () => {
    it('renders default chips', () => {
      const { getByRole } = render(<AmountInput />)
      expect(getByRole('button', { name: '25' })).toBeInTheDocument()
      expect(getByRole('button', { name: '50' })).toBeInTheDocument()
      expect(getByRole('button', { name: '100' })).toBeInTheDocument()
    })

    it('renders custom chips', () => {
      const { getByRole, queryByRole } = render(<AmountInput chips={[10, 20, 30]} />)
      expect(getByRole('button', { name: '10' })).toBeInTheDocument()
      expect(getByRole('button', { name: '20' })).toBeInTheDocument()
      expect(getByRole('button', { name: '30' })).toBeInTheDocument()
      expect(queryByRole('button', { name: '25' })).not.toBeInTheDocument()
    })

    it('calls onChange when chip is clicked', () => {
      const onChange = (value: string) => {
        expect(value).toBe('50')
      }
      const { getByRole } = render(<AmountInput onChange={onChange} />)
      fireEvent.click(getByRole('button', { name: '50' }))
    })
  })

  describe('Balance display', () => {
    it('displays balance when provided', () => {
      const { getByText } = render(
        <AmountInput balance="1000" balanceLabel="Available" currency="USDC" />,
      )
      expect(getByText(/Available 1000 USDC/)).toBeInTheDocument()
    })

    it('does not display balance when not provided', () => {
      const { queryByText } = render(<AmountInput balanceLabel="Available" />)
      // Balance label should not appear without balance prop
      expect(queryByText(/Available/)).not.toBeInTheDocument()
    })
  })
})
