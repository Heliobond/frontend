import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddressVerificationForm } from './AddressVerificationForm'

describe('AddressVerificationForm', () => {
  it('does not submit when address contains XSS payload', () => {
    const onSubmit = vi.fn()
    render(<AddressVerificationForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Street address *'), { target: { value: '<script>alert(1)</script>' } })
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
    fireEvent.change(screen.getByLabelText('Street address *'), { target: { value: "'; DROP TABLE users; --" } })
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
    fireEvent.change(screen.getByLabelText('Street address *'), { target: { value: '123 Main St' } })
    fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Springfield' } })
    fireEvent.change(screen.getByLabelText('State / Province *'), { target: { value: 'IL' } })
    fireEvent.change(screen.getByLabelText('ZIP / Postal code *'), { target: { value: '62701' } })
    fireEvent.change(screen.getByLabelText('Country *'), { target: { value: 'US' } })
    fireEvent.click(screen.getByText('Verify address'))
    expect(onSubmit).toHaveBeenCalled()
  })

  const setField = (label: string, value: string) => {
    const el = screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement
    if (el.tagName === 'SELECT') {
      const opt = document.createElement('option')
      opt.value = value
      el.appendChild(opt)
    }
    fireEvent.change(el, { target: { value } })
  }

  const fillForm = (values: Record<string, string>) => {
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
    { name: 'country', error: 'Country contains invalid characters' },
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
})
