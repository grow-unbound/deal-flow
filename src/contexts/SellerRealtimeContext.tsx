'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationStore, type AppNotification } from '@/hooks/useNotificationStore';
import { useSellerRealtime } from '@/hooks/useSellerRealtime';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface SellerRealtimeContextType {
  unreadCount: number;
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  newEntityIds: Map<string, 'new'>;
  markSeen: (entityId: string) => void;
}

const SellerRealtimeContext = createContext<SellerRealtimeContextType | undefined>(undefined);

export function SellerRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, currentTenantId, tenantProfile } = useAuth();
  const userId = user?.id ?? null;
  const tenantId = currentTenantId ?? '';
  const rawLocationIds = tenantProfile?.location_ids ?? null;
  const locationIdsKey =
    rawLocationIds && rawLocationIds.length > 0 ? [...rawLocationIds].sort().join(',') : '';
  const locationIds = useMemo(
    () => (locationIdsKey ? locationIdsKey.split(',') : rawLocationIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationIdsKey],
  );
  const [locationNamesById, setLocationNamesById] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function loadLocationNames() {
      if (!tenantId) {
        if (active) setLocationNamesById({});
        return;
      }

      let query = supabaseBrowser
        .schema('app')
        .from('locations')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (locationIds && locationIds.length > 0) {
        query = query.in('id', locationIds);
      }

      const { data, error } = await query;
      if (!active || error) return;

      const next = Object.fromEntries(
        (data ?? [])
          .map((row) => {
            const id = typeof row.id === 'string' ? row.id : null;
            const name = typeof row.name === 'string' ? row.name.trim() : '';
            return id && name ? [id, name] : null;
          })
          .filter((entry): entry is [string, string] => entry !== null),
      );
      setLocationNamesById(next);
    }

    void loadLocationNames();

    return () => {
      active = false;
    };
  }, [tenantId, locationIdsKey, locationIds]);

  const { notifications, add, patchByEntityId, markRead, markAllRead, unreadCount } = useNotificationStore(userId);

  const handleNew = useCallback((n: AppNotification) => {
    add(n);
    toast.info(n.title, {
      description: n.body,
      action: { label: 'View', onClick: () => { window.location.href = n.href; } },
      duration: 6000,
    });
  }, [add]);

  const { newEntityIds, markSeen } = useSellerRealtime({
    tenantId,
    locationIds,
    locationNamesById,
    onNew: handleNew,
    onPatch: patchByEntityId,
  });

  const value = useMemo(
    () => ({ unreadCount, notifications, markRead, markAllRead, newEntityIds, markSeen }),
    [unreadCount, notifications, markRead, markAllRead, newEntityIds, markSeen],
  );

  return (
    <SellerRealtimeContext.Provider value={value}>
      {children}
    </SellerRealtimeContext.Provider>
  );
}

export function useSellerRealtimeContext() {
  const ctx = useContext(SellerRealtimeContext);
  if (!ctx) throw new Error('useSellerRealtimeContext must be used inside SellerRealtimeProvider');
  return ctx;
}
