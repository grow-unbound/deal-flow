'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { AppNotification } from './useNotificationStore';

interface UseSellerRealtimeOptions {
  tenantId: string;
  locationIds: string[] | null;
  onNew: (n: AppNotification) => void;
}

export function useSellerRealtime({ tenantId, locationIds, onNew }: UseSellerRealtimeOptions) {
  const queryClient = useQueryClient();
  const [newEntityIds, setNewEntityIds] = useState<Map<string, 'new'>>(new Map());
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const markSeen = useCallback((entityId: string) => {
    setNewEntityIds((prev) => {
      if (!prev.has(entityId)) return prev;
      const next = new Map(prev);
      next.delete(entityId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabaseBrowser
      .channel(`seller:${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'estimates', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          if (locationIds && locationIds.length > 0) {
            const recLoc = record.location_id as string | null;
            if (!recLoc || !locationIds.includes(recLoc)) return;
          }
          const entityId = record.id as string;
          const estimateNumber = (record.estimate_number as string | null) ?? '–';
          const total = Number(record.total_amount ?? 0);
          const notification: AppNotification = {
            id: `${entityId}_new_estimate_${record.created_at as string}`,
            kind: 'new_estimate',
            title: `New estimate · ${estimateNumber}`,
            body: `₹${total.toLocaleString('en-IN')}`,
            entityType: 'estimate',
            entityId,
            href: `/estimates/${entityId}`,
            readAt: null,
            createdAt: (record.created_at as string) ?? new Date().toISOString(),
          };
          onNewRef.current(notification);
          setNewEntityIds((prev) => new Map(prev).set(entityId, 'new'));
          void queryClient.invalidateQueries({ queryKey: ['tenant-estimates'] });
          void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          if (locationIds && locationIds.length > 0) {
            const recLoc = record.location_id as string | null;
            if (!recLoc || !locationIds.includes(recLoc)) return;
          }
          const entityId = record.id as string;
          const orderNumber = (record.order_number as string | null) ?? '–';
          const total = Number(record.total_amount ?? 0);
          const notification: AppNotification = {
            id: `${entityId}_new_order_${record.created_at as string}`,
            kind: 'new_order',
            title: `New order · ${orderNumber}`,
            body: `₹${total.toLocaleString('en-IN')}`,
            entityType: 'order',
            entityId,
            href: `/sales-orders/${entityId}`,
            readAt: null,
            createdAt: (record.created_at as string) ?? new Date().toISOString(),
          };
          onNewRef.current(notification);
          setNewEntityIds((prev) => new Map(prev).set(entityId, 'new'));
          void queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
          void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [tenantId, locationIds, queryClient]);

  return { newEntityIds, markSeen };
}
