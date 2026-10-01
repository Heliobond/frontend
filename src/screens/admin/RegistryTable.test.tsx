import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/render'
import { RegistryTable } from './RegistryTable'
import type { RegistryEntry } from '@/data/admin'

const rows: RegistryEntry[] = [
  {
    id: 1,
    name: 'Benin Solar Farm',
    type: 'Solar',
    location: 'Benin',
    credit: 82,
    green: 90,
    funded: '$1,180,000',
    fundedAmount: 1180000,
    fundingGoal: 1500000,
    lastVerified: '2 days ago',
    priceHistory: [],
  },
  {
    id: 2,
    name: 'Atacama Wind Park',
    type: 'Wind',
    location: 'Chile',
    credit: 74,
    green: 78,
    funded: '$430,000',
    fundedAmount: 430000,
    fundingGoal: 600000,
    lastVerified: '6 days ago',
    priceHistory: [],
  },
  {
    id: 3,
    name: 'Mekong Hydro',
    type: 'Hydro',
    location: 'Laos',
    credit: 91,
    green: 85,
    funded: '$2,750,000',
    fundedAmount: 2750000,
    fundingGoal: 3000000,
    lastVerified: '11 days ago',
    priceHistory: [],
  },
]

/** Return the project name from each body row in DOM order. */
function rowNames(): string[] {
  // getAllByRole('row') returns header + data rows; skip [0] (thead row).
  const dataRows = screen.getAllByRole('row').slice(1)
  return dataRows.map((r) => {
    // First cell contains the project name in a child div with font-weight 600.
    const firstCell = within(r).getAllByRole('cell')[0]
    // textContent is "NameLocation" — grab the first text node only.
    return firstCell.children[0]?.textContent ?? ''
  })
}

// ---------------------------------------------------------------------------
// fundedNum parsing — exercised through sort behaviour
// ---------------------------------------------------------------------------

describe('RegistryTable fundedNum parsing', () => {
  it('sorts descending by funded amount on first Funded click', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by funded/i }))

    const names = rowNames()
    expect(names[0]).toBe('Mekong Hydro') // $2,750,000
    expect(names[1]).toBe('Benin Solar Farm') // $1,180,000
    expect(names[2]).toBe('Atacama Wind Park') // $430,000
  })

  it('sorts ascending by funded amount on second Funded click', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by funded/i }))
    fireEvent.click(screen.getByRole('button', { name: /sort by funded/i }))

    const names = rowNames()
    expect(names[0]).toBe('Atacama Wind Park') // $430,000
    expect(names[1]).toBe('Benin Solar Farm') // $1,180,000
    expect(names[2]).toBe('Mekong Hydro') // $2,750,000
  })
})

// ---------------------------------------------------------------------------
// Sort by name (string, alphabetical)
// ---------------------------------------------------------------------------

describe('RegistryTable sort by name', () => {
  it('sorts alphabetically asc on first Project click', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by project/i }))

    const names = rowNames()
    expect(names[0]).toBe('Atacama Wind Park')
    expect(names[1]).toBe('Benin Solar Farm')
    expect(names[2]).toBe('Mekong Hydro')
  })

  it('reverses to desc on second Project click', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by project/i }))
    fireEvent.click(screen.getByRole('button', { name: /sort by project/i }))

    const names = rowNames()
    expect(names[0]).toBe('Mekong Hydro')
    expect(names[1]).toBe('Benin Solar Farm')
    expect(names[2]).toBe('Atacama Wind Park')
  })
})

// ---------------------------------------------------------------------------
// Sort by credit (numeric)
// ---------------------------------------------------------------------------

describe('RegistryTable sort by credit', () => {
  it('defaults to credit desc (91, 82, 74)', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)

    const names = rowNames()
    expect(names[0]).toBe('Mekong Hydro') // credit 91
    expect(names[1]).toBe('Benin Solar Farm') // credit 82
    expect(names[2]).toBe('Atacama Wind Park') // credit 74
  })

  it('toggles to credit asc on clicking active Credit header', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by credit/i }))

    const names = rowNames()
    expect(names[0]).toBe('Atacama Wind Park') // credit 74
    expect(names[1]).toBe('Benin Solar Farm') // credit 82
    expect(names[2]).toBe('Mekong Hydro') // credit 91
  })
})

// ---------------------------------------------------------------------------
// Sort direction indicator arrows
// ---------------------------------------------------------------------------

describe('RegistryTable sort direction indicator', () => {
  it('shows ↓ for desc on the active column by default', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    expect(screen.getAllByText('↓').length).toBeGreaterThan(0)
  })

  it('shows ↑ after toggling the active column to asc', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /sort by credit/i }))
    expect(screen.getAllByText('↑').length).toBeGreaterThan(0)
  })
})

describe('RegistryTable aria-sort', () => {
  it('announces the active sort column and direction', () => {
    render(<RegistryTable rows={rows} onSave={() => {}} />)

    expect(screen.getByRole('columnheader', { name: /credit/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByRole('columnheader', { name: /project/i })).toHaveAttribute(
      'aria-sort',
      'none',
    )

    fireEvent.click(screen.getByRole('button', { name: /sort by project/i }))

    expect(screen.getByRole('columnheader', { name: /project/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(screen.getByRole('columnheader', { name: /credit/i })).toHaveAttribute(
      'aria-sort',
      'none',
    )
  })
})

// ---------------------------------------------------------------------------
// Inline score editor validation (#693)
// ---------------------------------------------------------------------------

describe('RegistryTable inline score validation', () => {
  // Default sort is credit desc: Mekong Hydro (91), Benin Solar Farm (82),
  // Atacama Wind Park (74). Benin is the row we edit below (index 1).
  const BENIN = 1

  function openBeninEditor(onSave: (id: number, credit: number, green: number) => void) {
    render(<RegistryTable rows={rows} onSave={onSave} />)
    fireEvent.click(
      screen.getAllByRole('button', { name: /update scores/i })[BENIN],
    )
  }

  function creditInput() {
    return screen.getByLabelText(/credit quality/i)
  }

  function saveButton() {
    return screen.getByRole('button', { name: /^save$/i })
  }

  it('disables Save when nothing changed', () => {
    openBeninEditor(() => {})
    // Draft starts at the row's current values (82 / 90): no change yet.
    expect(saveButton()).toBeDisabled()
  })

  it('disables Save and shows an error when a field is cleared', () => {
    const onSave = vi.fn()
    openBeninEditor(onSave)

    fireEvent.change(creditInput(), { target: { value: '' } })

    expect(creditInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number from 0 to 100/i)
    expect(saveButton()).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each(['150', '-1', '72.5'])('rejects %s with a visible error instead of clamping', (value) => {
    const onSave = vi.fn()
    openBeninEditor(onSave)

    fireEvent.change(creditInput(), { target: { value } })

    expect(creditInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number from 0 to 100/i)
    expect(saveButton()).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('enables Save after a valid change and passes integers to onSave', () => {
    const onSave = vi.fn()
    openBeninEditor(onSave)

    fireEvent.change(creditInput(), { target: { value: '83' } })

    expect(creditInput()).not.toHaveAttribute('aria-invalid', 'true')
    expect(saveButton()).not.toBeDisabled()

    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(1, 83, 90)
  })
})
