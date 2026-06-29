import { describe, it, expect } from 'vitest'
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
    lastVerified: '2 days ago',
  },
  {
    id: 2,
    name: 'Atacama Wind Park',
    type: 'Wind',
    location: 'Chile',
    credit: 74,
    green: 78,
    funded: '$430,000',
    lastVerified: '6 days ago',
  },
  {
    id: 3,
    name: 'Mekong Hydro',
    type: 'Hydro',
    location: 'Laos',
    credit: 91,
    green: 85,
    funded: '$2,750,000',
    lastVerified: '11 days ago',
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
