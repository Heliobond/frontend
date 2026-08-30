'use client'

import { useState } from 'react'
import { FormField, FormInput, FormSelect } from './FormField'
import { Button } from './Button'
import { scrollToFirstError } from '../lib/scrollToError'

export interface AddressValues {
  street: string
  city: string
  state: string
  zip: string
  country: string
  apartment?: string
}

interface Props {
  onSubmit?: (values: AddressValues) => void
  initial?: Partial<AddressValues>
}

export function AddressVerificationForm({ onSubmit, initial }: Props) {
  const [values, setValues] = useState<AddressValues>({
    street: initial?.street ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    zip: initial?.zip ?? '',
    country: initial?.country ?? 'US',
    apartment: initial?.apartment ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof AddressValues, string>>>({})

  function validate(): boolean {
    const next: typeof errors = {}
    if (!values.street.trim()) next.street = 'Street address is required'
    if (!values.city.trim()) next.city = 'City is required'
    if (!values.state.trim()) next.state = 'State is required'
    if (!values.zip.trim()) next.zip = 'ZIP code is required'
    if (!values.country.trim()) next.country = 'Country is required'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setTimeout(() => scrollToFirstError(document, { behavior: 'smooth' }), 50)
      return false
    }
    return true
  }

  function handleSubmit() {
    if (!validate()) return
    onSubmit?.(values)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--type-small)', color: 'var(--ink-60)', margin: 0 }}>
        <span style={{ color: 'var(--ember)' }}>*</span> Required fields &nbsp;·&nbsp; Optional fields are marked
      </p>

      <div data-field-wrapper>
        <FormField label="Street address *" htmlFor="addr-street">
          <FormInput
            id="addr-street"
            value={values.street}
            onChange={(e) => setValues({ ...values, street: e.target.value })}
            aria-invalid={!!errors.street}
            aria-describedby={errors.street ? 'err-street' : undefined}
            required
          />
        </FormField>
        {errors.street && <p id="err-street" role="alert" style={errorStyle}>{errors.street}</p>}
      </div>

      <div data-field-wrapper>
        <FormField label="Apartment, suite (optional)" htmlFor="addr-apt">
          <FormInput
            id="addr-apt"
            value={values.apartment}
            onChange={(e) => setValues({ ...values, apartment: e.target.value })}
            placeholder="Apt 4B (optional)"
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div data-field-wrapper>
          <FormField label="City *" htmlFor="addr-city">
            <FormInput id="addr-city" value={values.city} onChange={(e) => setValues({ ...values, city: e.target.value })} aria-invalid={!!errors.city} required />
          </FormField>
          {errors.city && <p role="alert" style={errorStyle}>{errors.city}</p>}
        </div>
        <div data-field-wrapper>
          <FormField label="State / Province *" htmlFor="addr-state">
            <FormInput id="addr-state" value={values.state} onChange={(e) => setValues({ ...values, state: e.target.value })} aria-invalid={!!errors.state} required />
          </FormField>
          {errors.state && <p role="alert" style={errorStyle}>{errors.state}</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div data-field-wrapper>
          <FormField label="ZIP / Postal code *" htmlFor="addr-zip">
            <FormInput id="addr-zip" value={values.zip} onChange={(e) => setValues({ ...values, zip: e.target.value })} aria-invalid={!!errors.zip} required />
          </FormField>
          {errors.zip && <p role="alert" style={errorStyle}>{errors.zip}</p>}
        </div>
        <div data-field-wrapper>
          <FormField label="Country *" htmlFor="addr-country">
            <FormSelect id="addr-country" value={values.country} onChange={(e) => setValues({ ...values, country: e.target.value })} aria-invalid={!!errors.country} required>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="GB">United Kingdom</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
            </FormSelect>
          </FormField>
          {errors.country && <p role="alert" style={errorStyle}>{errors.country}</p>}
        </div>
      </div>

      <Button variant="primary" onClick={handleSubmit}>Verify address</Button>
    </div>
  )
}

const errorStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ember)',
}
