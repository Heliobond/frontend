import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

export interface FormFieldProps {
  required?: boolean;
  optionalHint?: string;
  label: string
  htmlFor?: string
  children: ReactNode
  style?: CSSProperties
}

export function FormField({ label, htmlFor, children, style, required, optionalHint }: FormFieldProps) {
  return (
    <div data-field-wrapper>
    <label htmlFor={htmlFor} style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span className="hb-eyebrow">
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--ember)', marginLeft: 4 }}>*</span>}
        {required && <span className="sr-only"> (required)</span>}
        {optionalHint && <span style={{ fontWeight: 400, color: 'var(--ink-40)', marginLeft: 6 }}>{optionalHint}</span>}
      </span>
      {children}
    </label>
    </div>
  )
}

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  style?: CSSProperties
}

export function FormInput(props: FormInputProps) {
  return <input {...props} style={{ ...inputBaseStyle, ...(props.style ?? {}) }} />
}

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  style?: CSSProperties
}

export function FormTextarea(props: FormTextareaProps) {
  return (
    <textarea
      {...props}
      style={{ ...inputBaseStyle, ...((props.style as CSSProperties | undefined) ?? {}) }}
    />
  )
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  style?: CSSProperties
}

export function FormSelect(props: FormSelectProps) {
  return <select {...props} style={{ ...selectBaseStyle, ...(props.style ?? {}) }} />
}

const inputBaseStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '0 14px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-data)',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectBaseStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '0 14px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-data)',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
}
