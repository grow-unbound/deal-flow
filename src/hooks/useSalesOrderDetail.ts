'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import type {
  CancelSalesOrderBody,
  DeliverSalesOrderBody,
  DispatchSalesOrderBody,
  SalesOrderDetail,
} from '@/types/tenant-sales-orders';

export function useSalesOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-sales-order', orderId],
    queryFn: async (): Promise<SalesOrderDetail> => {
      if (!orderId) throw new Error('Missing order id');
      const res = await apiFetch(`/api/tenant/orders/${orderId}`);
      if (res.status === 404) throw new Error('Order not found');
      if (res.status === 403) throw new Error('Forbidden');
      if (!res.ok) throw new Error('Failed to load order');
      return res.json() as Promise<SalesOrderDetail>;
    },
    enabled: Boolean(orderId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useDispatchSalesOrder(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DispatchSalesOrderBody) => {
      const res = await apiPatch(`/api/tenant/orders/${orderId}/dispatch`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err === 'object' && err && 'error' in err ? String((err as { error: string }).error) : 'Dispatch failed');
      }
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-sales-order', orderId] });
      const previous = queryClient.getQueryData<SalesOrderDetail>(['tenant-sales-order', orderId]);
      const nowIso = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<SalesOrderDetail>(['tenant-sales-order', orderId], {
          ...previous,
          db_status: 'dispatched',
          ui_status: 'dispatched',
          dispatched_at: nowIso,
          carrier: payload.carrier?.trim() || previous.carrier,
          dispatch_notes: payload.notes?.trim() || previous.dispatch_notes,
        });
      }
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['tenant-sales-order', orderId], ctx.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-sales-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
    },
  });
}

export function useDeliverSalesOrder(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeliverSalesOrderBody) => {
      const res = await apiPatch(`/api/tenant/orders/${orderId}/deliver`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err === 'object' && err && 'error' in err ? String((err as { error: string }).error) : 'Deliver failed');
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['tenant-sales-order', orderId] });
      const previous = queryClient.getQueryData<SalesOrderDetail>(['tenant-sales-order', orderId]);
      const nowIso = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<SalesOrderDetail>(['tenant-sales-order', orderId], {
          ...previous,
          db_status: 'delivered',
          ui_status: 'delivered',
          delivered_at: nowIso,
        });
      }
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['tenant-sales-order', orderId], ctx.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-sales-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
    },
  });
}

export function useCancelSalesOrder(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CancelSalesOrderBody) => {
      const res = await apiPatch(`/api/tenant/orders/${orderId}/cancel`, payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err === 'object' && err && 'error' in err ? String((err as { error: string }).error) : 'Cancel failed');
      }
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-sales-order', orderId] });
      const previous = queryClient.getQueryData<SalesOrderDetail>(['tenant-sales-order', orderId]);
      const nowIso = new Date().toISOString();
      if (previous) {
        const reasonLabel = payload.reason.replace(/_/g, ' ');
        queryClient.setQueryData<SalesOrderDetail>(['tenant-sales-order', orderId], {
          ...previous,
          db_status: 'cancelled',
          ui_status: 'cancelled',
          cancelled_at: nowIso,
          cancel_reason: [reasonLabel, payload.notes].filter(Boolean).join(' — ') || reasonLabel,
        });
      }
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['tenant-sales-order', orderId], ctx.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenant-sales-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-orders'] });
    },
  });
}
