'use client';

import { useMutation, useQuery, useQueryClient, useInfiniteQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { appendArrayParam } from '@/lib/landing-filter-params';
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
    onMutate: async (payload) => {
      if (!invoiceId) return {};
      await qc.cancelQueries({ queryKey: ['tenant-invoice-composer', invoiceId] });
      const prev = qc.getQueryData<InvoiceComposerDocument>(['tenant-invoice-composer', invoiceId]);
      if (prev) {
        qc.setQueryData(['tenant-invoice-composer', invoiceId], { ...prev, ...payload });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (invoiceId && ctx?.prev) {
        qc.setQueryData(['tenant-invoice-composer', invoiceId], ctx.prev);
      }
      toast.error(e instanceof Error ? e.message : 'Failed to save invoice');
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
      const res = await apiFetch(`/api/tenant/invoices?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json() as Promise<TenantInvoicesResponse>;
    },
    initialData: getSellerLandingInitialData(period, initialData),
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}

export interface InvoicesInfiniteFilters {
  search?: string;
  source?: string[];
  status?: string[];
  due?: string[];
  location_id?: string[];
}

export interface TenantInvoicesPage extends TenantInvoicesResponse {
  nextCursor: string | null;
  total: number | null;
}

export function useTenantInvoicesInfinite(
  period: SellerLandingPeriod = 'month',
  filters: InvoicesInfiniteFilters = {},
) {
  return useInfiniteQuery({
    queryKey: ['tenant-invoices-infinite', period, filters],
    queryFn: async ({ pageParam }): Promise<TenantInvoicesPage> => {
      const params = new URLSearchParams({ period });
      if (pageParam) params.set('cursor', pageParam as string);
      if (filters.search?.trim()) params.set('search', filters.search.trim());
      appendArrayParam(params, 'source', filters.source);
      appendArrayParam(params, 'status', filters.status);
      appendArrayParam(params, 'due', filters.due);
      appendArrayParam(params, 'location_id', filters.location_id);
      const res = await apiFetch(`/api/tenant/invoices?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json() as Promise<TenantInvoicesPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: NAVIGATION_QUERY_STALE_TIME,
    gcTime: NAVIGATION_QUERY_GC_TIME,
  });
}
