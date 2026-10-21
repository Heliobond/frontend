import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender } from '@testing-library/react'
import { render, screen, fireEvent } from '@/test/render'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import fr from '../../messages/fr.json'
import { AddressVerificationForm } from './AddressVerificationForm'

describe('AddressVerificationForm', () => {
  it('does not submit when address contains XSS payload', () => {
    const onSubmit = vi.fn()
    render(<AddressVerificationForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Street address *'), {
      target: { value: '<script>alert(1)</script>' },
    })
    fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Springfield' } })
    fireEvent.change(screen.getByLabelText('State / Province *'), { target: { value: 'IL' } })
    fireEvent.change(screen.getByLabelText('ZIP / Postal code *'), { target: { value: '62701' } })
    fireEvent.change(screen.getByLabelText('Country *'), { target: { value: 'US' } })
    fireEvent.click(screen.getByText('Verify address'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Street address contains invalid characters')).toBeInTheDocument()
  })

  it('does not submit when address contains SQL injection payload', () => {
    const onSubmit = vi.fn()
    render(<AddressVerificationForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Street address *'), {
      target: { value: "'; DROP TABLE users; --" },
    })
    fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Springfield' } })
    fireEvent.change(screen.getByLabelText('State / Province *'), { target: { value: 'IL' } })
    fireEvent.change(screen.getByLabelText('ZIP / Postal code *'), { target: { value: '62701' } })
    fireEvent.change(screen.getByLabelText('Country *'), { target: { value: 'US' } })
    fireEvent.click(screen.getByText('Verify address'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Street address contains invalid characters')).toBeInTheDocument()
  })

  it('submits valid address', () => {
    const onSubmit = vi.fn()
    render(<AddressVerificationForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Street address *'), {
      target: { value: '123 Main St' },
    })
    fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Springfield' } })
    fireEvent.change(screen.getByLabelText('State / Province *'), { target: { value: 'IL' } })
    fireEvent.change(screen.getByLabelText('ZIP / Postal code *'), { target: { value: '62701' } })
    fireEvent.change(screen.getByLabelText('Country *'), { target: { value: 'US' } })
    fireEvent.click(screen.getByText('Verify address'))
    expect(onSubmit).toHaveBeenCalled()
  })

  // Additional security-focused edge case tests for all fields
  const setField = (label: string, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }

  const fillForm = (values: {
    street: string
    city: string
    state: string
    zip: string
    country: string
    apartment?: string
  }) => {
    setField('Street address *', values.street)
    setField('City *', values.city)
    setField('State / Province *', values.state)
    setField('ZIP / Postal code *', values.zip)
    setField('Country *', values.country)
  }

  const maliciousPayloads = [
    { type: 'XSS', value: '<script>alert(1)</script>' },
    { type: 'SQL injection', value: "'; DROP TABLE users; --" },
  ]

  const fieldTestCases = [
    { name: 'street', error: 'Street address contains invalid characters' },
    { name: 'city', error: 'City contains invalid characters' },
    { name: 'state', error: 'State / Province contains invalid characters' },
    { name: 'zip', error: 'ZIP / Postal code contains invalid characters' },
    // NOTE: `country` is intentionally excluded — it renders as a fixed
    // <select> whitelist, so free-text XSS/SQL payloads can never be entered.
    // A select whitelist is the injection defense for that field.
  ]

  fieldTestCases.forEach(({ name, error }) => {
    maliciousPayloads.forEach(({ type, value }) => {
      it(`does not submit when ${name} contains ${type} payload`, () => {
        const onSubmit = vi.fn()
        render(<AddressVerificationForm onSubmit={onSubmit} />)
        fillForm({
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
          country: 'US',
          [name]: value,
        })
        fireEvent.click(screen.getByText('Verify address'))
        expect(onSubmit).not.toHaveBeenCalled()
        expect(screen.getByText(error)).toBeInTheDocument()
      })
    })
  })

  it('links every field error to its control through aria-describedby (#871)', () => {
    render(<AddressVerificationForm initial={{ country: '', apartment: '<b>' }} />)
    fireEvent.click(screen.getByText('Verify address'))
    const labels = [
      'Street address *',
      'Apartment, suite (optional)',
      'City *',
      'State / Province *',
      'ZIP / Postal code *',
      'Country *',
    ]
    for (const label of labels) {
      const control = screen.getByLabelText(label)
      expect(control).toHaveAttribute('aria-invalid', 'true')
      const describedBy = control.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy!)).toHaveAttribute('role', 'alert')
    }
  })

  it('rejects a US ZIP that is not 5 or 9 digits (#871)', () => {
    const onSubmit = vi.fn()
    render(<AddressVerificationForm onSubmit={onSubmit} />)
    fillForm({ street: '1 Main St', city: 'Springfield', state: 'IL', zip: 'abc', country: 'US' })
    fireEvent.click(screen.getByText('Verify address'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('Enter a ZIP / postal code in the format used by the selected country'),
    ).toBeInTheDocument()
  })

  it('renders labels, errors and country names in the active locale (#867)', () => {
    rtlRender(
      <LocaleProvider initialLocale="fr" initialMessages={fr}>
        <AddressVerificationForm />
      </LocaleProvider>,
    )
    expect(screen.getByRole('option', { name: 'Royaume-Uni' })).toBeInTheDocument()
    fireEvent.click(screen.getByText(fr.Kyc.submit))
    expect(screen.getByLabelText(`${fr.Kyc.street} *`)).toHaveAccessibleDescription(
      fr.Kyc.errors.streetRequired,
    )
  })
})
