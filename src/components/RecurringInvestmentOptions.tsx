'use client'

interface RecurringInvestmentOptionsProps {
  enabled: boolean
  amount: number
  dayOfMonth: number
  onEnabledChange: (enabled: boolean) => void
  onDayChange: (day: number) => void
}

export function RecurringInvestmentOptions({
  enabled,
  amount,
  dayOfMonth,
  onEnabledChange,
  onDayChange,
}: RecurringInvestmentOptionsProps) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>Monthly auto-invest</legend>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />{' '}
        Invest {amount.toFixed(2)} USDC in this bond every month
      </label>
      {enabled && (
        <label style={selectLabelStyle}>
          Monthly investment day
          <select
            value={dayOfMonth}
            onChange={(event) => onDayChange(Number(event.target.value))}
            style={selectStyle}
          >
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <span style={hintStyle}>
            You can pause or change this schedule from your investments.
          </span>
        </label>
      )}
    </fieldset>
  )
}

const fieldsetStyle = {
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  padding: '12px 14px',
  margin: '0 0 18px',
}
const legendStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  fontWeight: 600,
  padding: '0 4px',
}
const labelStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-small)',
  lineHeight: 1.45,
}
const selectLabelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  marginTop: 12,
  marginLeft: 24,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
}
const selectStyle = {
  width: 'fit-content',
  border: '1px solid var(--ink-20)',
  borderRadius: 'var(--radius-input)',
  padding: '6px 28px 6px 8px',
  background: 'var(--paper)',
  color: 'var(--ink)',
}
const hintStyle = { color: 'var(--ink-60)', fontSize: 'var(--type-eyebrow)' }
