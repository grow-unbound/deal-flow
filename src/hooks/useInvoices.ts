'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod } from '@/lib/seller-period';
import type { InvoiceComposerDocument, InvoiceComposerSavePayload } from '@/types/invoice-composer';
import type { TenantInvoicesResponse } from '@/types/tenant-invoices';

export type { TenantInvoicesResponse } from '@/types/tenant-invoices';

export function useCreateInvoiceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost('/api/tenant/invoices', {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to create draft');
      }
      return (await res.json()) as { data: InvoiceComposerDocument };
    },
    onSuccess: (payload) => {
      qc.setQueryData(['tenant-invoice-composer', payload.data.id], payload.data);
    },
  });
}

export function useInvoiceComposer(invoiceId: string | null) {
  return useQuery({
    queryKey: ['tenant-invoice-composer', invoiceId],
    queryFn: async (): Promise<InvoiceComposerDocument> => {
      const res = await apiFetch(`/api/tenant/invoices/${invoiceId}?view=composer`);
      if (res.status === 404) throw new Error('not_found');
      if (res.status === 403) throw new Error('forbidden');
      if (!res.ok) throw new Error('Failed to fetch invoice');
      const json = (await res.json()) as { data: InvoiceComposerDocument };
      return json.data;
    },
    enabled: Boolean(invoiceId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useSaveInvoiceComposer(invoiceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InvoiceComposerSavePayload) => {
      if (!invoiceId) throw new Error('Missing invoice id');
      const res = await apiPatch(`/api/tenant/invoices/${invoiceId}`, { action: 'save', ...payload });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to save invoice');
      }
      return (await res.json()) as { data: InvoiceComposerDocument };
    },
    onSuccess: (payload) => {
      if (!invoiceId) return;
      qc.setQueryData(['tenant-invoice-composer', invoiceId], payload.data);
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
    },
  });
}

export function useSendInvoice(invoiceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!invoiceId) throw new Error('Missing invoice id');
      const res = await apiPatch(`/api/tenant/invoices/${invoiceId}`, { action: 'send' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to send invoice');
      }
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: () => {
      if (!invoiceId) return;
      void qc.invalidateQueries({ queryKey: ['tenant-invoice-composer', invoiceId] });
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
    },
  });
}

export function useTenantInvoices(period: SellerLandingPeriod = 'month', initialData?: TenantInvoicesResponse | null) {
  return useQuery({
    queryKey: ['tenant-invoices', period],
    queryFn: async (): Promise<TenantInvoicesResponse> => {
      const res = await apiFetch(`/api/tenant/invoices?limit=200&period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json() as Promise<TenantInvoicesResponse>;
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
