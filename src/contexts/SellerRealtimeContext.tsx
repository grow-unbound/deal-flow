'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationStore, type AppNotification } from '@/hooks/useNotificationStore';
import { useSellerRealtime } from '@/hooks/useSellerRealtime';

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
