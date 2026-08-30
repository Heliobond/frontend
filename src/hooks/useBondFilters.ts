'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPersistedYieldRange, persistYieldRange } from '@/lib/bondUtils';

export function useBondFilters() {
  const [yieldRange, setYieldRangeState] = useState<[number, number]>([0, 15]);

  useEffect(() => {
    setYieldRangeState(getPersistedYieldRange());
  }, []);

  const setYieldRange = useCallback((range: [number, number]) => {
    setYieldRangeState(range);
    persistYieldRange(range);
  }, []);

  // Persist across tab switches via storage event
  useEffect(() => {
    const handler = () => setYieldRangeState(getPersistedYieldRange());
    window.addEventListener('storage', handler);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') handler();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', handler);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { yieldRange, setYieldRange };
}

export default useBondFilters;
