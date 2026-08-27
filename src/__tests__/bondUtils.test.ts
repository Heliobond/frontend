import { searchBondsByName, sortBondsByYield, filterBondsByYield, getBondsForComparison } from '@/lib/bondUtils';

const bonds = [
  { id: '1', name: 'SOLAR Fund', yield: 5, term: 12, rating: 'A' },
  { id: '2', name: 'Wind Power', yield: 5, term: 24, rating: 'B' },
  { id: '3', name: 'Hydro Bond', yield: 7, term: 12, rating: 'A+' },
];

describe('bondUtils', () => {
  it('search is case-insensitive', () => {
    expect(searchBondsByName(bonds, 'solar')).toEqual([bonds[0]]);
    expect(searchBondsByName(bonds, 'SOLAR')).toEqual([bonds[0]]);
    expect(searchBondsByName(bonds, 'SoLaR')).toEqual([bonds[0]]);
  });

  it('stable sort handles ties by name then id', () => {
    const sorted = sortBondsByYield(bonds, 'asc');
    expect(sorted[0].name).toBe('SOLAR Fund');
    expect(sorted[1].name).toBe('Wind Power');
    expect(sorted[2].name).toBe('Hydro Bond');
  });

  it('filter by yield persists range', () => {
    expect(filterBondsByYield(bonds, [5,5]).length).toBe(2);
    expect(filterBondsByYield(bonds, [6,8]).length).toBe(1);
  });

  it('comparison requires 2-3 bonds', () => {
    expect(() => getBondsForComparison(bonds, ['1'])).toThrow(/2-3/);
    expect(getBondsForComparison(bonds, ['1','2']).length).toBe(2);
    expect(() => getBondsForComparison(bonds, ['1','999'])).toThrow(/not found/);
  });
});
