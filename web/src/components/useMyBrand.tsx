import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { brandStatus } from './format';
import { Badge, useLoad } from './ui';

const KEY = 'voucher.web.brand';

/** Brands visible to the current owner/manager plus a remembered selection. */
export function useMyBrand() {
  const brands = useLoad(api.myBrands);
  const [brandId, setBrandIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    const list = brands.data;
    if (list?.length && !list.some((b) => b.id === brandId)) setBrandIdState(list[0].id);
  }, [brands.data, brandId]);
  const setBrandId = (id: string) => {
    setBrandIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
  };
  const brand = brands.data?.find((b) => b.id === brandId) ?? null;
  return { brands, brand, brandId: brand?.id ?? '', setBrandId };
}

export function BrandPicker({ state }: { state: ReturnType<typeof useMyBrand> }) {
  const list = state.brands.data ?? [];
  if (!list.length) return null;
  const [label, tone] = state.brand ? brandStatus[state.brand.status] : ['', 'neutral' as const];
  return (
    <div className="row gap">
      {list.length > 1 ? (
        <select value={state.brandId} onChange={(e) => state.setBrandId(e.target.value)} style={{ minWidth: 220 }}>
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : (
        <strong>{state.brand?.name}</strong>
      )}
      {state.brand ? <Badge tone={tone}>{label}</Badge> : null}
    </div>
  );
}
