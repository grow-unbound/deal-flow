'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DELIVERY_COOKIE_NAME,
  parseDeliveryCookie,
  pushRecentLocation,
  serializeDeliveryCookie,
  type BuyerDeliveryCookiePayload,
  type BuyerDeliveryLocation,
} from '@/lib/buyer-delivery-location';

interface BuyerDeliveryContextValue {
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
  return parseDeliveryCookie(raw) ?? { selected: null, recent: [] };
}

function writeToDocument(payload: BuyerDeliveryCookiePayload): void {
  const maxAge = 60 * 60 * 24 * 365;
  const value = serializeDeliveryCookie(payload);
  document.cookie = `${DELIVERY_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function BuyerDeliveryProvider({
  children,
  initialPayload,
}: {
  children: React.ReactNode;
  initialPayload?: string | null;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<BuyerDeliveryCookiePayload>(() => {
    const fromServer = initialPayload ? parseDeliveryCookie(initialPayload) : null;
    if (fromServer) return { selected: fromServer.selected ?? null, recent: fromServer.recent ?? [] };
    return { selected: null, recent: [] };
  });

  React.useEffect(() => {
    if (initialPayload) return;
    setState(readFromDocument());
  }, [initialPayload]);

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
          || key === 'buyer-reorder'
        );
      },
    });
  }, [queryClient]);

  const value = React.useMemo<BuyerDeliveryContextValue>(
    () => ({
      selected: state.selected ?? null,
      recent: state.recent ?? [],
      setSelected,
      refreshFromDocumentCookie,
    }),
    [state.selected, state.recent, setSelected, refreshFromDocumentCookie],
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
