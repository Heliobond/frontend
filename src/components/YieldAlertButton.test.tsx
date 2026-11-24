import { beforeEach, describe, expect, it } from '@/test/bun'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { YieldAlertProvider } from '../alerts/YieldAlertProvider'
import { getAlerts, setAlerts, type YieldAlert } from '../lib/yieldAlerts'
import { ToastProvider } from './Toast'
import { YieldAlertButton } from './YieldAlertButton'

const makeAlert = (id: string, threshold: number, operator: 'above' | 'below'): YieldAlert => ({
  id,
  // No project with this id, so the evaluator never fires toasts in this test.
  bondId: 999,
  bondName: 'Sokoto Solar',
  threshold,
  operator,
  createdAt: '2026-01-01T00:00:00.000Z',
})

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <YieldAlertProvider>
          <YieldAlertButton bondId={999} bondName="Sokoto Solar" currentYield={10} />
        </YieldAlertProvider>
      </ToastProvider>
    </NextIntlClientProvider>,
  )
}

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: /edit yield alert for sokoto solar/i }))
  return screen.getByRole('dialog')
}

function alertGroup() {
  return screen.getByRole('group', { name: 'Choose an alert' })
}

describe('YieldAlertButton with several thresholds for one bond', () => {
  beforeEach(() => {
    localStorage.clear()
    setAlerts([])
  })

  it('edits the selected threshold and leaves the other one unchanged', () => {
    setAlerts([makeAlert('first', 5, 'above'), makeAlert('second', 3, 'below')])
    renderButton()
    const dialog = openEditor()

    expect(within(alertGroup()).getByRole('button', { name: 'Above 5.0%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(within(alertGroup()).getByRole('button', { name: 'Below 3.0%' }))
    expect(screen.getByLabelText('Threshold')).toHaveValue(3)

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '8' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save alert' }))

    const stored = getAlerts()
    expect(stored).toHaveLength(2)
    expect(stored[0]).toMatchObject({ id: 'first', threshold: 5, operator: 'above' })
    expect(stored[1]).toMatchObject({ id: 'second', threshold: 8, operator: 'below' })
  })

  it('deletes only the selected threshold', () => {
    setAlerts([makeAlert('first', 5, 'above'), makeAlert('second', 3, 'below')])
    renderButton()
    const dialog = openEditor()

    fireEvent.click(within(alertGroup()).getByRole('button', { name: 'Below 3.0%' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(getAlerts().map((a) => a.id)).toEqual(['first'])
  })

  it('can create a new threshold beside the existing ones', () => {
    setAlerts([makeAlert('first', 5, 'above'), makeAlert('second', 3, 'below')])
    renderButton()
    const dialog = openEditor()

    fireEvent.click(within(alertGroup()).getByRole('button', { name: 'New alert' }))
    expect(screen.getByLabelText('Threshold')).toHaveValue(5)

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '7' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save alert' }))

    expect(getAlerts()).toHaveLength(3)
    expect(getAlerts().map((a) => a.threshold)).toEqual([5, 3, 7])
  })
})
