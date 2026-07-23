'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { AppNotification } from './useNotificationStore';

interface UseSellerRealtimeOptions {
  tenantId: string;
  locationIds: string[] | null;
  locationNamesById: Record<string, string>;
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

type LinkedNumberTable = 'estimates' | 'orders';

interface TransactionRecord {
  id: string;
  location_id: string | null;
  created_at: string;
}

interface EstimateRecord extends TransactionRecord {
  estimate_number: string | null;
  source?: string | null;
  is_buyer_app_estimate?: boolean | null;
}

interface OrderRecord extends TransactionRecord {
  order_number: string | null;
  estimate_id?: string | null;
}

interface InvoiceRecord extends TransactionRecord {
  invoice_number: string | null;
  order_id?: string | null;
  estimate_id?: string | null;
}

interface LocationScopedRecord {
  location_id: string | null;
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
  record: LocationScopedRecord,
  locationIds: string[] | null,
): boolean {
  if (!locationIds || locationIds.length === 0) return true;
  const recLoc = record.location_id;
  return Boolean(recLoc && locationIds.includes(recLoc));
}

function locationLabel(record: TransactionRecord, locationNamesById: Record<string, string>): string {
  const locationId = record.location_id;
  if (!locationId) return 'Unassigned';
  return locationNamesById[locationId]?.trim() || 'Unassigned';
}

function notificationBody(location: string, detail?: string | null): string {
  return detail ? `${location} · ${detail}` : location;
}

function buildEstimateNotification(record: EstimateRecord, locationNamesById: Record<string, string>): AppNotification | null {
  const entityId = record.id;
  const estimateNumber = record.estimate_number?.trim();
  if (!estimateNumber) return null;

  const buyerAppTag = record.source === 'buyer_app' || record.is_buyer_app_estimate ? 'BUYER APP' : null;
  return {
    id: `${entityId}_new_estimate`,
    kind: 'new_estimate',
    title: `New estimate · ${estimateNumber}`,
    body: notificationBody(locationLabel(record, locationNamesById), buyerAppTag),
    entityType: 'estimate',
    entityId,
    href: `/estimates/${entityId}`,
    readAt: null,
    createdAt: record.created_at ?? new Date().toISOString(),
  };
}

function buildOrderNotification(
  record: OrderRecord,
  locationNamesById: Record<string, string>,
  estimateNumber: string | null,
): AppNotification | null {
  const entityId = record.id;
  const orderNumber = record.order_number?.trim();
  if (!orderNumber) return null;

  const conversionDetail = estimateNumber ? `From ${estimateNumber}` : null;
  return {
    id: `${entityId}_new_order`,
    kind: 'new_order',
    title: `New order · ${orderNumber}`,
    body: notificationBody(locationLabel(record, locationNamesById), conversionDetail),
    entityType: 'order',
    entityId,
    href: `/sales-orders/${entityId}`,
    readAt: null,
    createdAt: record.created_at ?? new Date().toISOString(),
  };
}

function buildInvoiceNotification(
  record: InvoiceRecord,
  locationNamesById: Record<string, string>,
  linkedNumber: string | null,
): AppNotification | null {
  const entityId = record.id;
  const invoiceNumber = record.invoice_number?.trim();
  if (!invoiceNumber) return null;

  const conversionDetail = linkedNumber ? `From ${linkedNumber}` : null;
  return {
    id: `${entityId}_new_invoice`,
    kind: 'new_invoice',
    title: `New invoice · ${invoiceNumber}`,
    body: notificationBody(locationLabel(record, locationNamesById), conversionDetail),
    entityType: 'invoice',
    entityId,
    href: `/invoices/${entityId}`,
    readAt: null,
    createdAt: record.created_at ?? new Date().toISOString(),
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

async function fetchLinkedNumber(
  table: LinkedNumberTable,
  id: string,
  field: 'estimate_number' | 'order_number',
): Promise<string | null> {
  if (table === 'estimates') {
    const { data, error } = await supabaseBrowser
      .schema('app')
      .from('estimates')
      .select('estimate_number')
      .eq('id', id)
      .maybeSingle();

    if (error) return null;
    const value = data?.estimate_number;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  const { data, error } = await supabaseBrowser
    .schema('app')
    .from('orders')
    .select('order_number')
    .eq('id', id)
    .maybeSingle();

  if (error) return null;
  const value = field === 'order_number' ? data?.order_number : null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function useSellerRealtime({ tenantId, locationIds, locationNamesById, onNew, onPatch }: UseSellerRealtimeOptions) {
  const queryClient = useQueryClient();
  const [newEntityIds, setNewEntityIds] = useState<Map<string, 'new'>>(new Map());
  const onNewRef = useRef(onNew);
  const onPatchRef = useRef(onPatch);
  const locationIdsRef = useRef(locationIds);
  const locationNamesByIdRef = useRef(locationNamesById);
  const estimateNumberCacheRef = useRef(new Map<string, string | null>());
  const orderNumberCacheRef = useRef(new Map<string, string | null>());
  onNewRef.current = onNew;
  onPatchRef.current = onPatch;
  locationIdsRef.current = locationIds;
  locationNamesByIdRef.current = locationNamesById;

  const locationIdsKey =
    locationIds && locationIds.length > 0 ? [...locationIds].sort().join(',') : '';
  const locationNamesKey = Object.entries(locationNamesById)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, name]) => `${id}:${name}`)
    .join('|');

  const markSeen = useCallback((entityId: string) => {
    setNewEntityIds((prev) => {
      if (!prev.has(entityId)) return prev;
      const next = new Map(prev);
      next.delete(entityId);
      return next;
    });
  }, []);

  const loadEstimateNumber = useCallback(async (estimateId: string | null | undefined) => {
    if (!estimateId) return null;
    if (estimateNumberCacheRef.current.has(estimateId)) {
      return estimateNumberCacheRef.current.get(estimateId) ?? null;
    }
    const estimateNumber = await fetchLinkedNumber('estimates', estimateId, 'estimate_number');
    estimateNumberCacheRef.current.set(estimateId, estimateNumber);
    return estimateNumber;
  }, []);

  const loadOrderNumber = useCallback(async (orderId: string | null | undefined) => {
    if (!orderId) return null;
    if (orderNumberCacheRef.current.has(orderId)) {
      return orderNumberCacheRef.current.get(orderId) ?? null;
    }
    const orderNumber = await fetchLinkedNumber('orders', orderId, 'order_number');
    orderNumberCacheRef.current.set(orderId, orderNumber);
    return orderNumber;
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const handleEstimateReady = (rawRecord: Record<string, unknown>, isUpdate: boolean) => {
      const record = rawRecord as unknown as EstimateRecord;
      if (!passesLocationFilter(record, locationIdsRef.current)) return;
      const notification = buildEstimateNotification(record, locationNamesByIdRef.current);
      if (!notification) return;

      const entityId = record.id;
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

    const handleOrderReady = async (rawRecord: Record<string, unknown>, isUpdate: boolean) => {
      const record = rawRecord as unknown as OrderRecord;
      if (!passesLocationFilter(record, locationIdsRef.current)) return;
      const estimateNumber = await loadEstimateNumber(record.estimate_id);
      const notification = buildOrderNotification(record, locationNamesByIdRef.current, estimateNumber);
      if (!notification) return;

      const entityId = record.id;
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

    const handleInvoiceReady = async (rawRecord: Record<string, unknown>, isUpdate: boolean) => {
      const record = rawRecord as unknown as InvoiceRecord;
      if (!passesLocationFilter(record, locationIdsRef.current)) return;
      const linkedNumber = (await loadOrderNumber(record.order_id)) ?? (await loadEstimateNumber(record.estimate_id));
      const notification = buildInvoiceNotification(record, locationNamesByIdRef.current, linkedNumber);
      if (!notification) return;

      const entityId = record.id;
      if (isUpdate && onPatchRef.current) {
        onPatchRef.current('invoice', entityId, {
          title: notification.title,
          body: notification.body,
        });
      }
      onNewRef.current(notification);
      setNewEntityIds((prev) => new Map(prev).set(entityId, 'new'));
      void queryClient.invalidateQueries({ queryKey: ['tenant-invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['tenant-invoices-infinite'] });
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
          void handleOrderReady(payload.new as Record<string, unknown>, false);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const oldRecord = payload.old as Record<string, unknown> | undefined;
          const newRecord = payload.new as Record<string, unknown>;
          if (!numberBecameAvailable(oldRecord, newRecord, 'order_number')) return;
          void handleOrderReady(newRecord, true);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'app', table: 'invoices', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          void handleInvoiceReady(payload.new as Record<string, unknown>, false);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'app', table: 'invoices', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const oldRecord = payload.old as Record<string, unknown> | undefined;
          const newRecord = payload.new as Record<string, unknown>;
          const oldNumber = (oldRecord?.invoice_number as string | null | undefined)?.trim() ?? '';
          const newNumber = (newRecord.invoice_number as string | null | undefined)?.trim() ?? '';
          if (!newNumber || oldNumber === newNumber) return;
          void handleInvoiceReady(newRecord, true);
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
  }, [tenantId, locationIdsKey, locationNamesKey, loadEstimateNumber, loadOrderNumber, queryClient]);

  return { newEntityIds, markSeen };
}
