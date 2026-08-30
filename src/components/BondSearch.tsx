'use client';
import { useState, useMemo } from 'react';
import type { Bond } from '@/lib/bondUtils';
import { searchBondsByName } from '@/lib/bondUtils';

interface Props {
  bonds: Bond[];
  onSelect?: (bond: Bond) => void;
}

export function BondSearch({ bonds, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchBondsByName(bonds, query), [bonds, query]);
  return (
    <div>
      <input
        type="search"
        placeholder="Search bonds by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search bonds by name"
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ink-12)' }}
      />
      <ul style={{ marginTop: 8, listStyle: 'none', padding: 0 }}>
        {results.map((b) => (
          <li key={String(b.id)} style={{ padding: '6px 0', borderBottom: '1px solid var(--ink-06)' }}>
            <button onClick={() => onSelect?.(b)} style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <strong>{b.name}</strong> — {b.yield}% — {b.rating}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default BondSearch;
