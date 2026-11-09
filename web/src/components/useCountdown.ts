import { useEffect, useState } from 'react';

/** Seconds remaining until `iso`, ticking each second; 0 when passed or not set. */
export function useCountdown(iso?: string | null) {
  const calc = () => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!iso) return;
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return left;
}

export const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
