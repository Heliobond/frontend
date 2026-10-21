'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { FormField, FormInput, FormSelect } from './FormField'
import { Button } from './Button'
import { scrollToFirstError } from '../lib/scrollToError'
import {
  validateAddress,
  type AddressValues,
  type AddressErrors,
  type AddressErrorKey,
} from '../lib/kycValidation'

export type { AddressValues }

interface Props {
  onSubmit?: (values: AddressValues) => void
  initial?: Partial<AddressValues>
}

/** Countries offered in the picker; each has a postal / state rule in kycValidation. */
const COUNTRY_CODES = ['US', 'CA', 'GB', 'DE', 'FR'] as const

/** Element id of a field's error message, referenced by its `aria-describedby`. */
const errorId = (field: keyof AddressValues) => `err-${field}`

/** Localized country name; falls back to the raw code when Intl cannot name it. */
function countryName(names: Intl.DisplayNames, code: string): string {
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * KYC address step. Not mounted by any route yet — there is no KYC flow to host
 * it — so it is exercised only by its tests until that flow lands (#871).
 */
export function AddressVerificationForm({ onSubmit, initial }: Props) {
  const t = useTranslations('Kyc')
  const locale = useLocale()
  const regionNames = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale])
  const [values, setValues] = useState<AddressValues>({
    street: initial?.street ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    zip: initial?.zip ?? '',
    country: initial?.country ?? 'US',
    apartment: initial?.apartment ?? '',
  })
  const [errors, setErrors] = useState<AddressErrors>({})

  function validate(): boolean {
    const next = validateAddress(values)
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

  /** ARIA wiring shared by every validated control. */
  const errorProps = (field: keyof AddressValues) => ({
    'aria-invalid': !!errors[field],
    'aria-describedby': errors[field] ? errorId(field) : undefined,
  })

  const fieldError = (field: keyof AddressValues) => {
    const key: AddressErrorKey | undefined = errors[field]
    return (
      key && (
        <p id={errorId(field)} role="alert" style={errorStyle}>
          {t(`errors.${key}`)}
        </p>
      )
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-small)',
          color: 'var(--ink-60)',
          margin: 0,
        }}
      >
        <span style={{ color: 'var(--ember)' }}>*</span> {t('requiredNote')}
      </p>

      <div data-field-wrapper>
        <FormField label={`${t('street')} *`} htmlFor="addr-street">
          <FormInput
            id="addr-street"
            value={values.street}
            onChange={(e) => setValues({ ...values, street: e.target.value })}
            {...errorProps('street')}
            required
          />
        </FormField>
        {fieldError('street')}
      </div>

      <div data-field-wrapper>
        <FormField label={t('apartment')} htmlFor="addr-apt">
          <FormInput
            id="addr-apt"
            value={values.apartment}
            onChange={(e) => setValues({ ...values, apartment: e.target.value })}
            placeholder={t('apartmentPlaceholder')}
            {...errorProps('apartment')}
          />
        </FormField>
        {fieldError('apartment')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div data-field-wrapper>
          <FormField label={`${t('city')} *`} htmlFor="addr-city">
            <FormInput
              id="addr-city"
              value={values.city}
              onChange={(e) => setValues({ ...values, city: e.target.value })}
              {...errorProps('city')}
              required
            />
          </FormField>
          {fieldError('city')}
        </div>
        <div data-field-wrapper>
          <FormField label={`${t('state')} *`} htmlFor="addr-state">
            <FormInput
              id="addr-state"
              value={values.state}
              onChange={(e) => setValues({ ...values, state: e.target.value })}
              {...errorProps('state')}
              required
            />
          </FormField>
          {fieldError('state')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div data-field-wrapper>
          <FormField label={`${t('zip')} *`} htmlFor="addr-zip">
            <FormInput
              id="addr-zip"
              value={values.zip}
              onChange={(e) => setValues({ ...values, zip: e.target.value })}
              {...errorProps('zip')}
              required
            />
          </FormField>
          {fieldError('zip')}
        </div>
        <div data-field-wrapper>
          <FormField label={`${t('country')} *`} htmlFor="addr-country">
            <FormSelect
              id="addr-country"
              value={values.country}
              onChange={(e) => setValues({ ...values, country: e.target.value })}
              {...errorProps('country')}
              required
            >
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {countryName(regionNames, code)}
                </option>
              ))}
              {values.country !== '' &&
                !(COUNTRY_CODES as readonly string[]).includes(values.country) && (
                  <option value={values.country}>{countryName(regionNames, values.country)}</option>
                )}
            </FormSelect>
          </FormField>
          {fieldError('country')}
        </div>
      </div>

      <Button variant="primary" onClick={handleSubmit}>
        {t('submit')}
      </Button>
    </div>
  )
}

const errorStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ember)',
}
