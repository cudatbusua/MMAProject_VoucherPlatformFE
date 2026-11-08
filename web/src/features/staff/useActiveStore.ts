import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useLoad } from '../../components/ui';

const KEY = 'voucher.web.activeStore';

/**
 * The working store lives on the server session (select-store). We remember the last choice locally
 * and re-select it once per page load, since a refreshed/new session starts without one.
 */
export function useActiveStore() {
  const stores = useLoad(api.myStores);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = useCallback(async (id: string) => {
    setSelecting(true);
    setError(null);
    try {
      await api.selectStore(id);
      setActiveId(id);
      try {
        localStorage.setItem(KEY, id);
      } catch {
        // ignore
      }
    } catch (e) {
      setError((e as Error).message);
      setActiveId(null);
    } finally {
      setSelecting(false);
    }
  }, []);

  useEffect(() => {
    const list = stores.data;
    if (!list || activeId) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // ignore
    }
    const target = list.find((s) => s.id === saved)?.id ?? (list.length === 1 ? list[0].id : null);
    if (target) void select(target);
  }, [stores.data, activeId, select]);

  const active = stores.data?.find((s) => s.id === activeId) ?? null;
  return { stores, active, select, selecting, error, clear: () => setActiveId(null) };
}
