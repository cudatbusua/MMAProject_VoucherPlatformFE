import { useMemo } from 'react';
import { useLoad } from '../../components/ui';
import { api } from '../../services/api';

/** Brands the staff member works for (via assigned active stores) — where the employee price applies. */
export function useMyBrandIds() {
  const stores = useLoad(api.myStores);
  const ids = useMemo(() => new Set((stores.data ?? []).map((s) => s.brandId)), [stores.data]);
  return { ids, loading: stores.loading };
}
