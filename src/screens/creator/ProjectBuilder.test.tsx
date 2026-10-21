import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender } from '@testing-library/react'
import { render, screen, fireEvent, act } from '@/test/render'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import { ProjectBuilder } from './ProjectBuilder'

const goalInput = () => screen.getByLabelText(en.Creator.fieldGoal)
const typeGoal = (value: string) => fireEvent.change(goalInput(), { target: { value } })
const flushPreview = (ms = 250) => act(() => vi.advanceTimersByTime(ms))

describe('ProjectBuilder', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('previews the draft goal without an error', () => {
    render(<ProjectBuilder />)
    expect(screen.getByText('$0 of $250,000')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(goalInput()).toHaveAttribute('aria-invalid', 'false')
  })

  it.each(['1,5', '1.2.3', 'abc', '', '1e6', '0'])(
    'flags %j as invalid and links the error to the input',
    (value) => {
      render(<ProjectBuilder />)
      typeGoal(value)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(en.Creator.goalInvalid)
      expect(goalInput()).toHaveAttribute('aria-invalid', 'true')
      expect(goalInput()).toHaveAttribute('aria-describedby', alert.id)
    },
  )

  it('rejects a goal above the maximum and accepts the maximum itself', () => {
    render(<ProjectBuilder />)
    typeGoal('100,000,001')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a funding goal of at most $100,000,000',
    )
    typeGoal('100,000,000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('updates the preview 250ms after typing stops', () => {
    render(<ProjectBuilder />)
    typeGoal('1,250')
    flushPreview(249)
    expect(screen.getByText('$0 of $250,000')).toBeInTheDocument()
    flushPreview(1)
    expect(screen.getByText('$0 of $1,250')).toBeInTheDocument()
  })

  it('previews "awaiting funding" while the goal is invalid', () => {
    render(<ProjectBuilder />)
    typeGoal('1,5')
    flushPreview()
    expect(screen.getByText(en.Creator.awaitingFunding)).toBeInTheDocument()
  })

  it('writes the project name into the preview card', () => {
    render(<ProjectBuilder />)
    fireEvent.change(screen.getByLabelText(en.Creator.fieldName), {
      target: { value: 'Atacama wind' },
    })
    flushPreview()
    expect(screen.getByText('Atacama wind')).toBeInTheDocument()
  })

  it('reads a French decimal comma as a decimal, not as 15', () => {
    rtlRender(
      <LocaleProvider initialLocale="fr" initialMessages={fr}>
        <ProjectBuilder />
      </LocaleProvider>,
    )
    const input = screen.getByLabelText(fr.Creator.fieldGoal)
    fireEvent.change(input, { target: { value: '1,5' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '1.2.3' } })
    expect(screen.getByRole('alert')).toHaveTextContent(fr.Creator.goalInvalid)
  })
})
