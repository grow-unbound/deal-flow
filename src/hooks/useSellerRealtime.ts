'use client';

import { formatNumberValue } from '@/lib/utils';
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

interface BroadcastRecord {
  id: string;
  name: string;
  status: string;
  actual_recipient_count: number | null;
  estimated_recipient_count: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  failed_count: number | null;
  updated_at: string;
}

function toBroadcastRecord(record: Record<string, unknown>): BroadcastRecord | null {
  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;
  const status = typeof record.status === 'string' ? record.status : null;
  const updatedAt = typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString();
  if (!id || !name || !status) return null;

  return {
    id,
    name,
    status,
    actual_recipient_count: typeof record.actual_recipient_count === 'number' ? record.actual_recipient_count : null,
    estimated_recipient_count: typeof record.estimated_recipient_count === 'number' ? record.estimated_recipient_count : null,
    sent_count: typeof record.sent_count === 'number' ? record.sent_count : null,
    delivered_count: typeof record.delivered_count === 'number' ? record.delivered_count : null,
    failed_count: typeof record.failed_count === 'number' ? record.failed_count : null,
    updated_at: updatedAt,
  };
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
    body: formatNumberValue(total, 'CURRENCY_EXACT'),
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
    body: formatNumberValue(total, 'CURRENCY_EXACT'),
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

function buildBroadcastProgress(record: BroadcastRecord) {
  const total = record.actual_recipient_count ?? record.estimated_recipient_count ?? 0;
  const sent = record.sent_count ?? 0;
  const delivered = record.delivered_count ?? 0;
  const failed = record.failed_count ?? 0;

  if (delivered > 0) return `${delivered}/${total} delivered`;
  if (sent > 0) return `${sent}/${total} sent`;
  if (failed > 0) return `${failed}/${total} failed`;
  if (record.status === 'scheduled') return 'Scheduled';
  return total > 0 ? `0/${total} queued` : 'Queued';
}

function buildBroadcastNotification(record: BroadcastRecord): AppNotification {
  return {
    id: `broadcast:${record.id}`,
    kind: 'broadcast_updated',
    title: `Broadcast update · ${record.name}`,
    body: buildBroadcastProgress(record),
    entityType: 'broadcast',
    entityId: record.id,
    href: '/customers/broadcasts',
    readAt: null,
    createdAt: record.updated_at ?? new Date().toISOString(),
  };
}

export function useSellerRealtime({ tenantId, locationIds, onNew, onPatch }: UseSellerRealtimeOptions) {
  const queryClient = useQueryClient();
  const [newEntityIds, setNewEntityIds] = useState<Map<string, 'new'>>(new Map());
  const onNewRef = useRef(onNew);
  const onPatchRef = useRef(onPatch);
  const locationIdsRef = useRef(locationIds);
  onNewRef.current = onNew;
  onPatchRef.current = onPatch;
  locationIdsRef.current = locationIds;

  const locationIdsKey =
    locationIds && locationIds.length > 0 ? [...locationIds].sort().join(',') : '';

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
      if (!passesLocationFilter(record, locationIdsRef.current)) return;
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
      if (!passesLocationFilter(record, locationIdsRef.current)) return;
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

    const handleBroadcastUpdate = (record: Record<string, unknown>) => {
      const parsed = toBroadcastRecord(record);
      if (!parsed) return;
      const notification = buildBroadcastNotification(parsed);
      if (onPatchRef.current) {
        onPatchRef.current('broadcast', notification.entityId, {
          title: notification.title,
          body: notification.body,
        });
      }
      onNewRef.current(notification);
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-broadcasts'] });
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'whatsapp_broadcasts', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          handleBroadcastUpdate(payload.new as Record<string, unknown>);
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [tenantId, locationIdsKey, queryClient]);

  return { newEntityIds, markSeen };
}
