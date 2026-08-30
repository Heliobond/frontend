'use client';
import type { Bond } from '@/lib/bondUtils';
import { getBondsForComparison } from '@/lib/bondUtils';

interface Props {
  bonds: Bond[];
  selectedIds: (string|number)[];
  onClose?: () => void;
}

export function BondComparisonView({ bonds, selectedIds, onClose }: Props) {
  let selected: Bond[] = [];
  let error: string | null = null;
  try {
    selected = getBondsForComparison(bonds, selectedIds);
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return <div role="alert" style={{ color: 'var(--danger)', padding: 16 }}>{error}</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selected.length}, 1fr)`, gap: 16 }}>
      {selected.map((b) => (
        <div key={String(b.id)} style={{ border: '1px solid var(--ink-12)', borderRadius: 12, padding: 16, background: 'var(--surface)' }}>
          <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>{b.name}</h3>
          <dl style={{ margin: 0, display: 'grid', gap: 6, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt>Yield</dt><dd style={{ fontWeight: 600 }}>{b.yield}%</dd></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt>Term</dt><dd>{b.term} months</dd></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt>Rating</dt><dd>{b.rating}</dd></div>
          </dl>
        </div>
      ))}
      {onClose && <button onClick={onClose} style={{ gridColumn: '1 / -1', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ink-12)' }}>Close comparison</button>}
    </div>
  );
}

export default BondComparisonView;
