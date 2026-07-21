'use client';

import { formatNumberValue } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { AppNotification } from './useNotificationStore';

interface CatalogRecord {
  id: string;
  scope_type: 'all' | 'buyer' | 'cohort' | 'geography';
  scope_value: Record<string, unknown> | null;
  status: string;
  name: string;
  share_token: string;
  created_at: string;
  updated_at: string;
}

function isBuyerInScope(record: CatalogRecord, buyerId: string, cohortIds: string[]): boolean {
  if (record.scope_type === 'all') return true;
  if (record.scope_type === 'buyer') {
    const ids = (record.scope_value?.buyer_ids ?? []) as string[];
    return ids.includes(buyerId);
  }
  if (record.scope_type === 'cohort') {
    const ids = (record.scope_value?.cohort_ids ?? []) as string[];
    return ids.some((id) => cohortIds.includes(id));
  }
  return true; // geography — RLS handles final access
}

interface UseBuyerRealtimeOptions {
  tenantId: string;
  buyerId: string;
  buyerCohortIds: string[];
  onNew: (n: AppNotification) => void;
  onPatch?: (entityType: AppNotification['entityType'], entityId: string, patch: Pick<AppNotification, 'title' | 'body'>) => void;
  onRefresh?: () => void;
}

const RECENT_EVENT_WINDOW_MS = 4000;
const recentBuyerRealtimeEvents = new Map<string, number>();

function shouldProcessBuyerRealtimeEvent(key: string): boolean {
  const now = Date.now();
  const lastSeen = recentBuyerRealtimeEvents.get(key);
  if (lastSeen != null && now - lastSeen < RECENT_EVENT_WINDOW_MS) {
    return false;
  }
  recentBuyerRealtimeEvents.set(key, now);

  for (const [entryKey, seenAt] of recentBuyerRealtimeEvents.entries()) {
    if (now - seenAt >= RECENT_EVENT_WINDOW_MS) {
      recentBuyerRealtimeEvents.delete(entryKey);
    }
  }
  return true;
}

function didEstimateNotificationFieldsChange(record: Record<string, unknown>, previous: Record<string, unknown> | undefined): boolean {
  if (!previous) return true;
  return (
    (record.status as string | null | undefined) !== (previous.status as string | null | undefined)
    || (record.estimate_number as string | null | undefined) !== (previous.estimate_number as string | null | undefined)
  );
}

export function useBuyerRealtime({ tenantId, buyerId, buyerCohortIds, onNew, onPatch, onRefresh }: UseBuyerRealtimeOptions) {
  const [updatedEntityIds, setUpdatedEntityIds] = useState<Map<string, 'new' | 'updated'>>(new Map());
  const onNewRef = useRef(onNew);
  const onPatchRef = useRef(onPatch);
  const onRefreshRef = useRef(onRefresh);
  onNewRef.current = onNew;
  onPatchRef.current = onPatch;
  onRefreshRef.current = onRefresh;

  const markSeen = useCallback((entityId: string) => {
    setUpdatedEntityIds((prev) => {
      if (!prev.has(entityId)) return prev;
      const next = new Map(prev);
      next.delete(entityId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tenantId || !buyerId) return;

    const channel = supabaseBrowser
      .channel(`buyer:${tenantId}:${buyerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'campaigns', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const record = payload.new as CatalogRecord | undefined;
          if (!record || record.status !== 'published') return;
          if (!isBuyerInScope(record, buyerId, buyerCohortIds)) return;
          const entityId = record.id;
          onNewRef.current({
            id: `${entityId}_new_catalog_${record.updated_at}`,
            kind: 'new_catalog',
            title: `New catalog: ${record.name}`,
            body: 'Tap to browse products',
            entityType: 'catalog',
            entityId,
            href: `/buy/catalog?share_token=${encodeURIComponent(record.share_token)}`,
            readAt: null,
            createdAt: record.updated_at,
          });
          setUpdatedEntityIds((prev) => new Map(prev).set(entityId, 'new'));
          onRefreshRef.current?.();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'orders', filter: `buyer_id=eq.${buyerId}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const entityId = record.id as string;
          const orderNumber = (record.order_number as string | null) ?? '';
          const status = (record.status as string) ?? '';
          onNewRef.current({
            id: `${entityId}_order_updated_${record.updated_at as string}`,
            kind: 'order_updated',
            title: `Order updated · ${orderNumber}`,
            body: `Status: ${status}`,
            entityType: 'order',
            entityId,
            href: `/buy/orders?highlight=${entityId}`,
            readAt: null,
            createdAt: (record.updated_at as string) ?? new Date().toISOString(),
          });
          setUpdatedEntityIds((prev) => new Map(prev).set(entityId, 'updated'));
          onRefreshRef.current?.();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'estimates', filter: `buyer_id=eq.${buyerId}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const previous = payload.old as Record<string, unknown> | undefined;
          if (!didEstimateNotificationFieldsChange(record, previous)) return;
          const entityId = record.id as string;
          const estimateNumber = (record.estimate_number as string | null) ?? '';
          const status = (record.status as string) ?? '';
          const eventKey = `estimate:${entityId}:${estimateNumber}:${status}`;
          if (!shouldProcessBuyerRealtimeEvent(eventKey)) return;
          const title = `Estimate updated · ${estimateNumber}`;
          const body = `Status: ${status}`;
          onPatchRef.current?.('estimate', entityId, {
            title,
            body,
          });
          onNewRef.current({
            id: `${entityId}_estimate_updated`,
            kind: 'estimate_updated',
            title,
            body,
            entityType: 'estimate',
            entityId,
            href: `/buy/orders?tab=enquiries&highlight=${entityId}`,
            readAt: null,
            createdAt: (record.updated_at as string) ?? new Date().toISOString(),
          });
          setUpdatedEntityIds((prev) => new Map(prev).set(entityId, 'updated'));
          onRefreshRef.current?.();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'app', table: 'invoices', filter: `buyer_id=eq.${buyerId}` },
        (payload) => {
          const record = payload.new as Record<string, unknown>;
          const entityId = record.id as string;
          const invoiceNumber = (record.invoice_number as string | null) ?? '';
          const isInsert = payload.eventType === 'INSERT';
          const total = Number(record.total_amount ?? 0);
          onNewRef.current({
            id: `${entityId}_invoice_${isInsert ? 'new' : 'updated'}_${record.updated_at as string}`,
            kind: 'invoice_updated',
            title: `Invoice ${isInsert ? 'issued' : 'updated'} · ${invoiceNumber}`,
            body: formatNumberValue(total, 'CURRENCY_EXACT'),
            entityType: 'invoice',
            entityId,
            href: `/buy/orders?tab=invoices&highlight=${entityId}`,
            readAt: null,
            createdAt: (record.updated_at as string) ?? new Date().toISOString(),
          });
          setUpdatedEntityIds((prev) => new Map(prev).set(entityId, isInsert ? 'new' : 'updated'));
          onRefreshRef.current?.();
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [tenantId, buyerId, buyerCohortIds]);

  return { updatedEntityIds, markSeen };
}
