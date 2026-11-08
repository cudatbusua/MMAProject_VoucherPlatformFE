import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Campaign } from '../types';

export interface CartItem {
  campaignId: string;
  title: string;
  brandName: string;
  salePrice: number;
  faceValue: number;
  limitPerUser: number;
  quantity: number;
  // One key per checkout attempt; kept while retrying so the server never creates duplicate orders.
  idempotencyKey: string;
}

interface CartState {
  items: CartItem[];
  count: number;
  total: number;
  add: (campaign: Campaign, quantity: number) => void;
  setQuantity: (campaignId: string, quantity: number) => void;
  remove: (campaignId: string) => void;
  clear: () => void;
}

const KEY = 'voucher.cart.v1';
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setItems(JSON.parse(v) as CartItem[]))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => undefined);
  }, [items, loaded]);

  const add = useCallback((c: Campaign, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.campaignId === c.id);
      if (existing)
        return prev.map((i) =>
          i.campaignId === c.id
            ? {
                ...i,
                quantity: Math.min(i.quantity + quantity, c.limitPerUser),
                idempotencyKey: randomUUID(),
              }
            : i,
        );
      return [
        ...prev,
        {
          campaignId: c.id,
          title: c.title,
          brandName: typeof c.brandId === 'object' ? c.brandId.name : '',
          salePrice: c.salePrice,
          faceValue: c.faceValue,
          limitPerUser: c.limitPerUser,
          quantity: Math.min(quantity, c.limitPerUser),
          idempotencyKey: randomUUID(),
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((campaignId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.campaignId === campaignId
          ? {
              ...i,
              quantity: Math.max(1, Math.min(quantity, i.limitPerUser)),
              idempotencyKey: randomUUID(),
            }
          : i,
      ),
    );
  }, []);

  const remove = useCallback((campaignId: string) => {
    setItems((prev) => prev.filter((i) => i.campaignId !== campaignId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      total: items.reduce((s, i) => s + i.quantity * i.salePrice, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [items, add, setQuantity, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
