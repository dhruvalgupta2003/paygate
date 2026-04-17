import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '~/lib/schemas';
import { MOCK_TRANSACTIONS } from '~/mocks/fixtures';

/**
 * Mocked "live tx" pulse. In production this would attach to VITE_WS_URL.
 * For the dashboard-only demo it recycles recent fixtures at a steady tick.
 */
export function useLivePulse(limit = 8): {
  items: Transaction[];
  paused: boolean;
  setPaused: (paused: boolean) => void;
} {
  const [items, setItems] = useState<Transaction[]>(() =>
    MOCK_TRANSACTIONS.slice(0, limit),
  );
  const [paused, setPaused] = useState(false);
  const idxRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    let id: number | undefined;
    const tick = () => {
      idxRef.current = (idxRef.current + 1) % MOCK_TRANSACTIONS.length;
      const source = MOCK_TRANSACTIONS[idxRef.current];
      if (!source) return;
      const next: Transaction = {
        ...source,
        id: `tx_live_${Date.now()}_${idxRef.current}`,
        observed_at: new Date().toISOString(),
      };
      setItems((prev) => [next, ...prev].slice(0, limit));
    };
    id = window.setInterval(tick, 2200);
    return () => {
      if (id !== undefined) window.clearInterval(id);
    };
  }, [limit, paused]);

  return { items, paused, setPaused };
}
