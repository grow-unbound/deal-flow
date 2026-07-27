'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationStore, type AppNotification } from '@/hooks/useNotificationStore';
import { useBuyerRealtime } from '@/hooks/useBuyerRealtime';
import { useBuyerMe } from '@/hooks/useBuyerMe';

interface BuyerRealtimeContextType {
  unreadCount: number;
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  updatedEntityIds: Map<string, 'new' | 'updated'>;
  markSeen: (entityId: string) => void;
  triggerRefresh: (() => Promise<void> | void) | null;
  setRefreshFn: (fn: (() => Promise<void> | void) | null) => void;
}

const BuyerRealtimeContext = createContext<BuyerRealtimeContextType | undefined>(undefined);

export function BuyerRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, currentTenantId, currentBuyerId } = useAuth();
  const { data: buyerMe } = useBuyerMe();
  const userId = user?.id ?? null;
  const tenantId = currentTenantId ?? buyerMe?.tenant.id ?? '';
  const buyerId = currentBuyerId ?? (buyerMe?.buyer_id && buyerMe.buyer_id !== 'preview' ? buyerMe.buyer_id : '') ?? '';

  const [refreshFn, setRefreshFnState] = React.useState<(() => Promise<void> | void) | null>(null);
  const setRefreshFn = useCallback((fn: (() => Promise<void> | void) | null) => setRefreshFnState(() => fn), []);

  const [buyerCohortIds] = React.useState<string[]>([]);

  const { notifications, add, patchByEntityId, markRead, markAllRead, unreadCount } = useNotificationStore(userId);

  const handleNew = useCallback((n: AppNotification) => {
    const added = add(n);
    if (!added) return;
    toast.info(n.title, {
      description: n.body,
      action: { label: 'View', onClick: () => { window.location.href = n.href; } },
      duration: 6000,
    });
  }, [add]);

  const handleRefresh = useCallback(() => {
    refreshFn?.();
  }, [refreshFn]);

  const { updatedEntityIds, markSeen } = useBuyerRealtime({
    tenantId,
    buyerId,
    buyerCohortIds,
    onNew: handleNew,
    onPatch: patchByEntityId,
    onRefresh: handleRefresh,
  });

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      markRead,
      markAllRead,
      updatedEntityIds,
      markSeen,
      triggerRefresh: refreshFn,
      setRefreshFn,
    }),
    [unreadCount, notifications, markRead, markAllRead, updatedEntityIds, markSeen, refreshFn, setRefreshFn],
  );

  return (
    <BuyerRealtimeContext.Provider value={value}>
      {children}
    </BuyerRealtimeContext.Provider>
  );
}

export function useBuyerRealtimeContext() {
  const ctx = useContext(BuyerRealtimeContext);
  if (!ctx) throw new Error('useBuyerRealtimeContext must be used inside BuyerRealtimeProvider');
  return ctx;
}
