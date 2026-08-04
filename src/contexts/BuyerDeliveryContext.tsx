'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DELIVERY_COOKIE_NAME,
  DELIVERY_RECENT_STORAGE_KEY,
  buyerDeliveryCookieSchema,
  parseDeliveryCookie,
  pushRecentLocation,
  serializeDeliveryCookie,
  type BuyerDeliveryCookiePayload,
  type BuyerDeliveryLocation,
} from '@/lib/buyer-delivery-location';

interface BuyerDeliveryContextValue {
  hydrated: boolean;
  selected: BuyerDeliveryLocation | null;
  recent: BuyerDeliveryLocation[];
  setSelected: (loc: BuyerDeliveryLocation) => void;
  refreshFromDocumentCookie: () => void;
}

export const BuyerDeliveryContext = React.createContext<BuyerDeliveryContextValue | null>(null);

export function useBuyerDeliveryOptional(): BuyerDeliveryContextValue | null {
  return React.useContext(BuyerDeliveryContext);
}

function readFromDocument(): BuyerDeliveryCookiePayload {
  if (typeof document === 'undefined') return { selected: null, recent: [] };
  const raw = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${DELIVERY_COOKIE_NAME}=`))
    ?.slice(`${DELIVERY_COOKIE_NAME}=`.length);
  return {
    selected: parseDeliveryCookie(raw)?.selected ?? null,
    recent: readRecentFromStorage(),
  };
}

function writeToDocument(payload: BuyerDeliveryCookiePayload): void {
  const maxAge = 60 * 60 * 24 * 365;
  const value = serializeDeliveryCookie(payload);
  document.cookie = `${DELIVERY_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  writeRecentToStorage(payload.recent ?? []);
}

function readRecentFromStorage(): BuyerDeliveryLocation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DELIVERY_RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const result = buyerDeliveryCookieSchema.safeParse({ recent: parsed });
    return result.success ? result.data.recent ?? [] : [];
  } catch {
    return [];
  }
}

function writeRecentToStorage(recent: BuyerDeliveryLocation[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DELIVERY_RECENT_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Ignore quota/security errors; selected outlet still persists via cookie.
  }
}

export function BuyerDeliveryProvider({
  children,
  initialPayload,
}: {
  children: React.ReactNode;
  initialPayload?: string | null;
}) {
  const queryClient = useQueryClient();
  const hasServerCookiePayload = typeof initialPayload === 'string' && initialPayload.length > 0;
  const [state, setState] = React.useState<BuyerDeliveryCookiePayload>(() => {
    const fromServer = initialPayload ? parseDeliveryCookie(initialPayload) : null;
    if (fromServer) return { selected: fromServer.selected ?? null, recent: fromServer.recent ?? [] };
    return { selected: null, recent: [] };
  });
  const [hydrated, setHydrated] = React.useState<boolean>(hasServerCookiePayload);

  React.useEffect(() => {
    setState((prev) => {
      const clientState = readFromDocument();
      const nextSelected = clientState.selected ?? prev.selected ?? null;
      const clientRecent = clientState.recent ?? [];
      const nextRecent = clientRecent.length > 0 ? clientRecent : prev.recent ?? [];
      const sameSelected = JSON.stringify(nextSelected) === JSON.stringify(prev.selected ?? null);
      const sameRecent = JSON.stringify(nextRecent) === JSON.stringify(prev.recent ?? []);
      if (sameSelected && sameRecent) return prev;
      return { selected: nextSelected, recent: nextRecent };
    });
    setHydrated(true);
  }, [hasServerCookiePayload]);

  React.useEffect(() => {
    const selected = state.selected;
    if (!selected) return;
    if (selected.selection_source === 'outlet') return;
    if (
      selected.routed_location_id
      && selected.routed_location_name
      && (selected.nearest_warehouse_id || selected.nearest_warehouse_fallback)
    ) {
      return;
    }
    if (!Number.isFinite(selected.lat) || !Number.isFinite(selected.lng)) return;

    let cancelled = false;

    void fetch(`/api/buyer/nearest-location?lat=${selected.lat}&lng=${selected.lng}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          warehouse_id: string | null;
          warehouse_name: string | null;
          location_id: string | null;
          location_name: string | null;
          distance_km: number | null;
          fallback: boolean;
        }>;
      })
      .then((routing) => {
        if (cancelled || !routing) return;
        setState((prev) => {
          if (!prev.selected) return prev;
          const nextSelected = {
            ...prev.selected,
            selection_source: prev.selected.selection_source ?? 'maps',
            nearest_warehouse_id: routing.warehouse_id,
            routed_location_id: routing.location_id,
            routed_location_name: routing.location_name,
            nearest_warehouse_name: routing.warehouse_name,
            nearest_warehouse_distance_km: routing.distance_km,
            nearest_warehouse_fallback: routing.fallback,
          };
          const next = pushRecentLocation(
            { ...prev, selected: nextSelected, recent: prev.recent ?? [] },
            nextSelected,
          );
          next.selected = nextSelected;
          writeToDocument(next);
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [state.selected]);

  const refreshFromDocumentCookie = React.useCallback(() => {
    setState(readFromDocument());
    setHydrated(true);
  }, []);

  const setSelected = React.useCallback((loc: BuyerDeliveryLocation) => {
    setState((prev) => {
      const next = pushRecentLocation(
        { selected: loc, recent: prev.recent ?? [] },
        loc,
      );
      next.selected = loc;
      writeToDocument(next);
      return next;
    });
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.startsWith('buyer-catalog')
          || key.startsWith('buyer-product')
          || key === 'buyer-categories'
          || key === 'buyer-brands'
          || key === 'buyer-resolved-products'
        );
      },
    });
  }, [queryClient]);

  const value = React.useMemo<BuyerDeliveryContextValue>(
    () => ({
      hydrated,
      selected: state.selected ?? null,
      recent: state.recent ?? [],
      setSelected,
      refreshFromDocumentCookie,
    }),
    [hydrated, state.selected, state.recent, setSelected, refreshFromDocumentCookie],
  );

  return <BuyerDeliveryContext.Provider value={value}>{children}</BuyerDeliveryContext.Provider>;
}

export function useBuyerDelivery(): BuyerDeliveryContextValue {
  const ctx = useBuyerDeliveryOptional();
  if (!ctx) {
    throw new Error('useBuyerDelivery must be used within BuyerDeliveryProvider');
  }
  return ctx;
}
