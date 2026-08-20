// useSignalDesk: loads authoritative 1D Signal Desk result for the given symbol.
// Independent of the visual chart range/zoom state.

import { useEffect, useState } from 'react';
import type { SignalDeskResult } from '../../../shared/signalV2';
import { api } from '../../api';

export function useSignalDesk(symbol: string) {
  const [data, setData] = useState<SignalDeskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getSignalDesk(symbol).then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Signal Desk failed');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { data, loading, error };
}
