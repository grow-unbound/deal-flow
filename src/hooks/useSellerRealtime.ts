'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { AppNotification } from './useNotificationStore';

interface UseSellerRealtimeOptions {
  tenantId: string;
  locationIds: string[] | null;
  onNew: (n: AppNotification) => void;
  onPatch?: (entityType: AppNotification['entityType'], entityId: string, patch: Pick<AppNotification, 'title' | 'body'>) => void;
}

function passesLocationFilter(
  record: Record<string, unknown>,
  locationIds: string[] | null,
): boolean {
  if (!locationIds || locationIds.length === 0) return true;
  const recLoc = record.location_id as string | null;
  return Boolean(recLoc && locationIds.includes(recLoc));
}

function buildEstimateNotification(record: Record<string, unknown>): AppNotification | null {
  const entityId = record.id as string;
  const estimateNumber = (record.estimate_number as string | null)?.trim();
  if (!estimateNumber) return null;

  const total = Number(record.total_amount ?? 0);
  return {
    id: `${entityId}_new_estimate`,
    kind: 'new_estimate',
    title: `New estimate · ${estimateNumber}`,
    body: `₹${total.toLocaleString('en-IN')}`,
    entityType: 'estimate',
    entityId,
    href: `/estimates/${entityId}`,
    readAt: null,
    createdAt: (record.created_at as string) ?? new Date().toISOString(),
  };
}

function buildOrderNotification(record: Record<string, unknown>): AppNotification | null {
  const entityId = record.id as string;
  const orderNumber = (record.order_number as string | null)?.trim();
  if (!orderNumber) return null;

  const total = Number(record.total_amount ?? 0);
  return {
    id: `${entityId}_new_order`,
    kind: 'new_order',
    title: `New order · ${orderNumber}`,
    body: `₹${total.toLocaleString('en-IN')}`,
    entityType: 'order',
    entityId,
    href: `/sales-orders/${entityId}`,
    readAt: null,
    createdAt: (record.created_at as string) ?? new Date().toISOString(),
  };
}

function numberBecameAvailable(
  oldRecord: Record<string, unknown> | undefined,
  newRecord: Record<string, unknown>,
  field: 'estimate_number' | 'order_number',
): boolean {
  const oldNumber = (oldRecord?.[field] as string | null | undefined)?.trim() ?? '';
  const newNumber = (newRecord[field] as string | null | undefined)?.trim() ?? '';
  return Boolean(newNumber && oldNumber !== newNumber);
}

export function useSellerRealtime({ tenantId, locationIds, onNew, onPatch }: UseSellerRealtimeOptions) {
  const queryClient = useQueryClient();
  const [newEntityIds, setNewEntityIds] = useState<Map<string, 'new'>>(new Map());
  const onNewRef = useRef(onNew);
  const onPatchRef = useRef(onPatch);
  onNewRef.current = onNew;
  onPatchRef.current = onPatch;

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

    const handleEstimateReady = (record: Record<string, unknown>, isUpdate: boolean) => {
      if (!passesLocationFilter(record, locationIds)) return;
      const notification = buildEstimateNotification(record);
      if (!notification) return;

      const entityId = record.id as string;
      if (isUpdate && onPatchRef.current) {
        onPatchRef.current('estimate', entityId, {
          title: notification.title,
          body: notification.body,
        });
      }
      onNewRef.current(notification);
      setNewEntityIds((prev) => new Map(prev).set(entityId, 'new'));
      void queryClient.invalidateQueries({ queryKey: ['tenant-estimates'] });
      void queryClient.invalidateQueries({ queryKey: ['tenant-estimates-infinite'] });
      void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
    };

    const handleOrderReady = (record: Record<string, unknown>, isUpdate: boolean) => {
      if (!passesLocationFilter(record, locationIds)) return;
      const notification = buildOrderNotification(record);
      if (!notification) return;

      const entityId = record.id as string;
      if (isUpdate && onPatchRef.current) {
        onPatchRef.current('order', entityId, {
          title: notification.title,
          body: notification.body,
        });
      }
      onNewRef.current(notification);
      setNewEntityIds((prev) => new Map(prev).set(entityId, 'new'));
      void queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
    };

    const channel = supabaseBrowser
      .channel(`seller:${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'estimates', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          handleEstimateReady(payload.new as Record<string, unknown>, false);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'estimates', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const oldRecord = payload.old as Record<string, unknown> | undefined;
          const newRecord = payload.new as Record<string, unknown>;
          if (!numberBecameAvailable(oldRecord, newRecord, 'estimate_number')) return;
          handleEstimateReady(newRecord, true);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          handleOrderReady(payload.new as Record<string, unknown>, false);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const oldRecord = payload.old as Record<string, unknown> | undefined;
          const newRecord = payload.new as Record<string, unknown>;
          if (!numberBecameAvailable(oldRecord, newRecord, 'order_number')) return;
          handleOrderReady(newRecord, true);
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [tenantId, locationIds, queryClient]);

  return { newEntityIds, markSeen };
}
