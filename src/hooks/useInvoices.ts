'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { NAVIGATION_QUERY_GC_TIME, NAVIGATION_QUERY_STALE_TIME } from '@/lib/query-navigation';
import { getSellerLandingInitialData, type SellerLandingPeriod } from '@/lib/seller-period';
import type { InvoiceComposerDocument, InvoiceComposerSavePayload } from '@/types/invoice-composer';
import type { TenantInvoicesResponse } from '@/types/tenant-invoices';

export type { TenantInvoicesResponse } from '@/types/tenant-invoices';

async function fetchTenantInvoiceComposer(invoiceId: string): Promise<InvoiceComposerDocument> {
  const res = await apiFetch(`/api/tenant/invoices/${invoiceId}?view=composer`);
  if (res.status === 404) throw new Error('not_found');
  if (res.status === 403) throw new Error('forbidden');
  if (!res.ok) throw new Error('Failed to fetch invoice');
  const json = (await res.json()) as { data: InvoiceComposerDocument };
  return json.data;
}

export function tenantInvoiceComposerQueryOptions(invoiceId: string) {
  return {
    queryKey: ['tenant-invoice-composer', invoiceId] as const,
    queryFn: () => fetchTenantInvoiceComposer(invoiceId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  };
}

export async function prefetchInvoiceComposer(qc: QueryClient, invoiceId: string): Promise<void> {
  await qc.prefetchQuery(tenantInvoiceComposerQueryOptions(invoiceId));
}

export function useInvoiceComposer(invoiceId: string | null) {
  return useQuery({
    queryKey: ['tenant-invoice-composer', invoiceId],
    queryFn: () => fetchTenantInvoiceComposer(invoiceId!),
    enabled: Boolean(invoiceId),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export function useNextInvoiceNumber(enabled: boolean) {
  return useQuery({
    queryKey: ['next-invoice-number'],
    queryFn: async (): Promise<string> => {
      const res = await apiFetch('/api/tenant/invoices/next-number');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch next invoice number');
      }
      const json = (await res.json()) as { invoice_number: string };
      return json.invoice_number;
    },
    enabled,
    staleTime: 30_000,
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
    onMutate: async () => {
      if (!invoiceId) return {};
      await qc.cancelQueries({ queryKey: ['tenant-invoice-composer', invoiceId] });
      const prev = qc.getQueryData<InvoiceComposerDocument>(['tenant-invoice-composer', invoiceId]);
      const sentAt = new Date().toISOString();
      if (prev) {
        qc.setQueryData<InvoiceComposerDocument>(['tenant-invoice-composer', invoiceId], {
          ...prev,
          status: 'sent',
          sent_at: sentAt,
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (invoiceId && ctx?.prev) {
        qc.setQueryData(['tenant-invoice-composer', invoiceId], ctx.prev);
      }
      toast.error(e instanceof Error ? e.message : 'Failed to send invoice');
    },
    onSuccess: () => {
      toast.success('Invoice sent');
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
